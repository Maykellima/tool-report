// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT = `Your mission is to act as an expert digital tool analyst. Your golden rule is to NEVER INVENT, SIMULATE, OR GUESS INFORMATION.

**General Rules:**
* When a piece of data is not found, the corresponding JSON value must be "N/A" for strings, an empty array [] for lists, or 0 for numbers. Do not add any extra explanatory text.
* For list-based fields ('categories', 'target_audience', 'key_features', 'alternatives', 'pros', 'cons'), you MUST provide a **minimum of 1 and a maximum of 4** of the most relevant points.
* The 'pricing' field is freeform; report the information you find.

**Mandatory Research Process:**
1.  **Step 1 (Primary Source):** Your main source of information is the provided URL. Analyze it thoroughly first.
2.  **Step 2 (External Cross-Reference):** You MUST cross-reference and enrich the information from Step 1 by performing searches on reliable and specialized external sources relevant to the tool's sector.

**Instruction for 'consistency_web_vs_users':**
* Estimate a percentage that reflects the consistency between the official website's information and the opinions/data from users on external sources.

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
  "consulted_sources": ["string (URL)", ...]
}`;

/**
 * Translates the AI's JSON object into a formatted Slack message.
 */
function formatJsonToSlackMarkdown(data) {
  let md = '----------\n\n';
  md += `*Name:*\n${data.name}\n\n----------\n\n`;
  md += `🌐 *Official URL:*\n${data.official_url}\n\n----------\n\n`;
  md += `✍️ *Short Description:*\n${data.short_description}\n\n----------\n\n`;
  
  if (data.categories && data.categories.length > 0) {
    md += `📂 *Category:*\n• ${data.categories.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.target_audience && data.target_audience.length > 0) {
    md += `🎯 *Target Audience:*\n• ${data.target_audience.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.key_features && data.key_features.length > 0) {
    md += `✨ *Key Features:*\n• ${data.key_features.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.use_case) {
    md += `👀 *Use Case:*\n${data.use_case}\n\n----------\n\n`;
  }
  
  md += `💰 *Pricing:*\n${data.pricing}\n\n----------\n\n`;

  if (data.alternatives && data.alternatives.length > 0) {
    const alts = data.alternatives.map((alt, i) => `${i + 1}. *${alt.name}* — ${alt.url}`).join('\n');
    md += `🔄 *Alternatives:*\n${alts}\n\n----------\n\n`;
  }

  if (data.pros && data.pros.length > 0) {
    md += `✅ *Pros:*\n• ${data.pros.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.cons && data.cons.length > 0) {
    md += `⚠️ *Cons:*\n• ${data.cons.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.consistency_web_vs_users) {
    md += `📊 *Web vs Users Consistency:*\n• ${data.consistency_web_vs_users}%\n\n----------\n\n`;
  }

  if (data.consulted_sources && data.consulted_sources.length > 0) {
    md += `🔗 *Consulted Sources:*\n• ${data.consulted_sources.join('\n• ')}\n\n----------`;
  }

  return md.trim();
}


serve(async (req) => {
  const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;
  const model = 'sonar-pro';

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '🏁 Starting Report...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  (async () => {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      );

      const requestBody = {
        model: model,
        messages: [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": `Please follow your instructions for the following URL and complete the report: ${commandText}` }
        ]
      };

      const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${perplexityApiKey}`
        },
        body: JSON.stringify(requestBody),
      });

      if (!perplexityResponse.ok) {
        const errorBody = await perplexityResponse.text();
        throw new Error(`The Perplexity API responded with an error: ${perplexityResponse.statusText}. Details: ${errorBody}`);
      }

      const data = await perplexityResponse.json();
      const content = data.choices[0].message.content;
      
      const jsonStringMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonStringMatch) {
        throw new Error("AI response did not contain a valid JSON block.");
      }
      const jsonString = jsonStringMatch[0];
      const reportData = JSON.parse(jsonString);

      const { error: upsertError } = await supabase
        .from('reports')
        .upsert({
          official_url: reportData.official_url,
          last_searched_at: new Date().toISOString(),
          name: reportData.name,
          short_description: reportData.short_description,
          categories: reportData.categories,
          target_audience: reportData.target_audience,
          key_features: reportData.key_features,
          use_case: reportData.use_case,
          pricing: reportData.pricing,
          alternatives: reportData.alternatives,
          pros: reportData.pros,
          cons: reportData.cons,
          consistency_web_vs_users: reportData.consistency_web_vs_users,
          consulted_sources: reportData.consulted_sources,
        }, { onConflict: 'official_url' });

      if (upsertError) {
        console.error('Error saving to Supabase:', upsertError);
      }
      
      const md = formatJsonToSlackMarkdown(reportData);

      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'in_channel', text: md }),
      });

    } catch (error) {
      console.error('Error during analysis with Perplexity:', error);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ An error occurred while processing the analysis with Perplexity: ${error.message}`,
        }),
      });
    }
  })();

  return initialResponse;
});