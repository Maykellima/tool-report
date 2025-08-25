// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT_EN = `Your mission is to act as an expert digital tool analyst. Your golden rule is to NEVER INVENT INFORMATION. If you don't find a piece of data, the JSON value must be "N/A" for strings, an empty array [] for lists, or 0 for numbers.

**Research Process:**
1.  Perform an exhaustive search about the provided URL.
2.  Cross-reference the information with reliable and specialized external sources.
3.  Estimate the 'consistency_web_vs_users' percentage based on the consistency between the official website and external feedback.

**Mandatory Output Format:**
Your response MUST be a single, valid JSON code block. Do not add any text before or after it. Follow this exact schema:
{
  "name": "string",
  "official_url": "string",
  "short_description": "string",
  "categories": ["string", ...],
  "target_audience": ["string", ...],
  "key_features": ["string", ...],
  "use_case": "string",
  "pricing": "string",
  "alternatives": [{"name": "string", "url": "string"}, ...],
  "pros": ["string", ...],
  "cons": ["string", ...],
  "consistency_web_vs_users": "number",
  "consulted_sources": ["string (URL with Title in Slack format <url|title>)", ...]
}`;

/**
 * Translates the AI's JSON object into a formatted Slack message in the target language.
 */
function formatJsonToSlackMarkdown(data, lang = 'en') {
  const titles = {
    en: {
      name: '*Name:*',
      url: '🌐 *Official URL:*',
      desc: '✍️ *Short Description:*',
      cat: '📂 *Category:*',
      audience: '🎯 *Target Audience:*',
      features: '✨ *Key Features:*',
      use_case: '👀 *Use Case:*',
      pricing: '💰 *Pricing:*',
      alts: '🔄 *Alternatives:*',
      pros: '✅ *Pros:*',
      cons: '⚠️ *Cons:*',
      consistency: '📊 *Web vs Users Consistency:*',
      sources: '🔗 *Consulted Sources:*',
    },
    es: {
      name: '*Nombre:*',
      url: '🌐 *URL oficial:*',
      desc: '✍️ *Descripción corta:*',
      cat: '📂 *Categoría:*',
      audience: '🎯 *Público objetivo:*',
      features: '✨ *Características clave:*',
      use_case: '👀 *Caso de uso:*',
      pricing: '💰 *Precio:*',
      alts: '🔄 *Alternativas:*',
      pros: '✅ *Pros:*',
      cons: '⚠️ *Contras:*',
      consistency: '📊 *Coincidencia web vs usuarios:*',
      sources: '🔗 *Fuentes consultadas:*',
    }
  };

  const t = lang === 'es' ? titles.es : titles.en;
  let md = '----------\n\n';
  md += `${t.name}\n${data.name}\n\n----------\n\n`;
  md += `${t.url}\n${data.official_url}\n\n----------\n\n`;
  md += `${t.desc}\n${data.short_description}\n\n----------\n\n`;
  
  if (data.categories && data.categories.length > 0) {
    md += `${t.cat}\n• ${data.categories.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.target_audience && data.target_audience.length > 0) {
    md += `${t.audience}\n• ${data.target_audience.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.key_features && data.key_features.length > 0) {
    md += `${t.features}\n• ${data.key_features.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.use_case) {
    md += `${t.use_case}\n${data.use_case}\n\n----------\n\n`;
  }
  
  md += `${t.pricing}\n${data.pricing}\n\n----------\n\n`;

  if (data.alternatives && data.alternatives.length > 0) {
    const alts = data.alternatives.map((alt, i) => `${i + 1}. *${alt.name}* — ${alt.url}`).join('\n');
    md += `${t.alts}\n${alts}\n\n----------\n\n`;
  }

  if (data.pros && data.pros.length > 0) {
    md += `${t.pros}\n• ${data.pros.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.cons && data.cons.length > 0) {
    md += `${t.cons}\n• ${data.cons.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.consistency_web_vs_users) {
    md += `${t.consistency}\n• ${data.consistency_web_vs_users}%\n\n----------\n\n`;
  }

  if (data.consulted_sources && data.consulted_sources.length > 0) {
    md += `${t.sources}\n• ${data.consulted_sources.join('\n• ')}\n\n----------`;
  }

  return md.trim();
}

serve(async (req) => {
  const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
  const formData = await req.formData();
  const commandText = (formData.get('text') as string).trim();
  const responseUrl = formData.get('response_url') as string;
  const model = 'sonar-pro';

  let url_to_analyze = commandText;
  let target_language = 'en';

  if (commandText.toLowerCase().endsWith(' español')) {
    target_language = 'es';
    url_to_analyze = commandText.slice(0, -' español'.length).trim();
  }

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '🏁 Iniciando Reporte...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  (async () => {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      );

      const researchBody = {
        model: model,
        messages: [
            { "role": "system", "content": SYSTEM_PROMPT_EN },
            { "role": "user", "content": `Please follow your instructions for the following URL and complete the report: ${url_to_analyze}` }
        ]
      };
      const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${perplexityApiKey}` },
        body: JSON.stringify(researchBody),
      });
      if (!perplexityResponse.ok) throw new Error(`Perplexity API (Research) Error: ${await perplexityResponse.text()}`);
      
      const researchData = await perplexityResponse.json();
      const content = researchData.choices[0].message.content;
      const jsonStringMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonStringMatch) throw new Error("AI response did not contain a valid JSON block.");
      const reportDataEN = JSON.parse(jsonStringMatch[0]);

      const { error: upsertError } = await supabase
        .from('reports')
        .upsert({
          official_url: reportDataEN.official_url,
          last_searched_at: new Date().toISOString(),
          name: reportDataEN.name,
          short_description: reportDataEN.short_description,
          categories: reportDataEN.categories,
          target_audience: reportDataEN.target_audience,
          key_features: reportDataEN.key_features,
          use_case: reportDataEN.use_case,
          pricing: reportDataEN.pricing,
          alternatives: reportDataEN.alternatives,
          pros: reportDataEN.pros,
          cons: reportDataEN.cons,
          consistency_web_vs_users: reportDataEN.consistency_web_vs_users,
          consulted_sources: reportDataEN.consulted_sources,
        }, { onConflict: 'official_url' });

      if (upsertError) console.error('Error saving to Supabase:', upsertError);

      let finalReportData = reportDataEN;
      if (target_language === 'es') {
        const translationBody = {
          model: model,
          messages: [
            { "role": "system", "content": "You are a helpful translation assistant. Translate the string values in the user-provided JSON object to Spanish. Keep the JSON structure and keys identical. Respond only with the translated JSON block." },
            { "role": "user", "content": JSON.stringify(reportDataEN) }
          ]
        };
        const translationResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${perplexityApiKey}` },
          body: JSON.stringify(translationBody),
        });
        if (!translationResponse.ok) throw new Error(`Perplexity API (Translation) Error: ${await translationResponse.text()}`);

        const translationData = await translationResponse.json();
        const translatedContent = translationData.choices[0].message.content;
        const translatedJsonMatch = translatedContent.match(/\{[\s\S]*\}/);
        if (!translatedJsonMatch) throw new Error("AI translation response did not contain a valid JSON block.");
        finalReportData = JSON.parse(translatedJsonMatch[0]);
      }
      
      const md = formatJsonToSlackMarkdown(finalReportData, target_language);

      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'in_channel', text: md }),
      });

    } catch (error) {
      console.error('Error during analysis:', error);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ An error occurred while processing the analysis: ${error.message}`,
        }),
      });
    }
  })();

  return initialResponse;
});