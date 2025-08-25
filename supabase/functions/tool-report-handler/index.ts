// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// NUEVO: Prompt actualizado para solicitar un JSON con todos los campos de la tabla.
const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR INFORMACIÓN. Si no encuentras un dato, el valor en el JSON debe ser "N/A" para strings, un array vacío [] para listas, o 0 para números.

**Proceso de Investigación:**
1.  Realiza una búsqueda exhaustiva sobre la URL proporcionada.
2.  Contrasta la información con fuentes externas fiables y especializadas.
3.  Estima el porcentaje de 'Coincidencia web vs usuarios' basándote en la consistencia entre la web oficial y las opiniones externas.

**Formato de Salida Obligatorio:**
Tu respuesta DEBE ser un único bloque de código JSON válido. Sigue este esquema exacto:
{
  "nombre": "string",
  "url_oficial": "string",
  "descripcion_corta": "string",
  "categorias": ["string", ...],
  "publico_objetivo": ["string", ...],
  "caracteristicas_clave": ["string", ...],
  "caso_de_uso": "string",
  "precio": "string",
  "alternativas": [{"nombre": "string", "url": "string"}, ...],
  "pros": ["string", ...],
  "contras": ["string", ...],
  "coincidencia_web_vs_usuarios": "number",
  "fuentes_consultadas": ["string (URL)", ...]
}`;

// NUEVO: Función de formato actualizada para incluir los nuevos campos.
function formatJsonToSlackMarkdown(data) {
  let md = '----------\n\n';
  md += `*Nombre:*\n${data.nombre}\n\n----------\n\n`;
  md += `🌐 *URL oficial:*\n${data.url_oficial}\n\n----------\n\n`;
  md += `✍️ *Descripción corta:*\n${data.descripcion_corta}\n\n----------\n\n`;
  
  if (data.categorias && data.categorias.length > 0) {
    md += `📂 *Categoría:*\n• ${data.categorias.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.publico_objetivo && data.publico_objetivo.length > 0) {
    md += `🎯 *Público objetivo:*\n• ${data.publico_objetivo.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.caracteristicas_clave && data.caracteristicas_clave.length > 0) {
    md += `✨ *Características clave:*\n• ${data.caracteristicas_clave.join('\n• ')}\n\n----------\n\n`;
  }
  
  if (data.caso_de_uso) {
    md += `👀 *Caso de uso:*\n${data.caso_de_uso}\n\n----------\n\n`;
  }
  
  md += `💰 *Precio:*\n${data.precio}\n\n----------\n\n`;

  if (data.alternativas && data.alternativas.length > 0) {
    const alts = data.alternativas.map((alt, i) => `${i + 1}. *${alt.nombre}* — ${alt.url}`).join('\n');
    md += `🔄 *Alternativas:*\n${alts}\n\n----------\n\n`;
  }

  if (data.pros && data.pros.length > 0) {
    md += `✅ *Pros:*\n• ${data.pros.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.contras && data.contras.length > 0) {
    md += `⚠️ *Contras:*\n• ${data.contras.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.coincidencia_web_vs_usuarios) {
    md += `📊 *Coincidencia web vs usuarios:*\n• ${data.coincidencia_web_vs_usuarios}%\n\n----------\n\n`;
  }

  if (data.fuentes_consultadas && data.fuentes_consultadas.length > 0) {
    md += `🔗 *Fuentes consultadas:*\n• ${data.fuentes_consultadas.join('\n• ')}\n\n----------`;
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

      const requestBody = {
        model: model,
        messages: [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": `Por favor, sigue tus instrucciones para la siguiente URL y completa el informe: ${commandText}` }
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
        throw new Error(`La API de Perplexity respondió con un error: ${perplexityResponse.statusText}. Detalles: ${errorBody}`);
      }

      const data = await perplexityResponse.json();
      const content = data.choices[0].message.content;
      
      const jsonStringMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonStringMatch) {
        throw new Error("La respuesta de la IA no contenía un bloque JSON válido.");
      }
      const jsonString = jsonStringMatch[0];
      const reportData = JSON.parse(jsonString);

      // NUEVO: La llamada a la base de datos ahora incluye todos los campos nuevos.
      const { error: upsertError } = await supabase
        .from('reports')
        .upsert({
          url_oficial: reportData.url_oficial,
          last_searched_at: new Date().toISOString(),
          nombre: reportData.nombre,
          descripcion_corta: reportData.descripcion_corta,
          categorias: reportData.categorias,
          publico_objetivo: reportData.publico_objetivo,
          caracteristicas_clave: reportData.caracteristicas_clave,
          caso_de_uso: reportData.caso_de_uso,
          precio: reportData.precio,
          alternativas: reportData.alternativas,
          pros: reportData.pros,
          contras: reportData.contras,
          coincidencia_web_vs_usuarios: reportData.coincidencia_web_vs_usuarios,
          fuentes_consultadas: reportData.fuentes_consultadas,
        }, { onConflict: 'url_oficial' });

      if (upsertError) {
        console.error('Error al guardar en Supabase:', upsertError);
      }
      
      const md = formatJsonToSlackMarkdown(reportData);

      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'in_channel', text: md }),
      });

    } catch (error) {
      console.error('Error en el análisis:', error);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ Ocurrió un error al procesar el análisis: ${error.message}`,
        }),
      });
    }
  })();

  return initialResponse;
});