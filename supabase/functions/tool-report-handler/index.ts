// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
// NUEVO: Importamos el cliente de Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR INFORMACIÓN. Si no encuentras un dato, el valor en el JSON debe ser "N/A" para strings o un array vacío [] para listas.

**Proceso de Investigación:**
1.  Realiza una búsqueda exhaustiva sobre la URL proporcionada.
2.  Contrasta la información con fuentes externas fiables y especializadas.

**Formato de Salida Obligatorio:**
Tu respuesta DEBE ser un único bloque de código JSON válido, sin texto antes ni después. Sigue este esquema exacto:
{
  "nombre": "string",
  "url_oficial": "string",
  "descripcion_corta": "string",
  "categorias": ["string", ...],
  "publico_objetivo": ["string", ...],
  "caracteristicas_clave": ["string", ...],
  "precio": "string",
  "alternativas": [
    {"nombre": "string", "url": "string"},
    {"nombre": "string", "url": "string"}
  ],
  "pros": ["string", ...],
  "contras": ["string", ...]
}`;

/**
 * Función para convertir el objeto JSON del AI en un mensaje de Slack formateado.
 */
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
  
  md += `💰 *Precio:*\n${data.precio}\n\n----------\n\n`;

  if (data.alternativas && data.alternativas.length > 0) {
    const alts = data.alternativas.map((alt, i) => `${i + 1}. *${alt.nombre}* — ${alt.url}`).join('\n');
    md += `🔄 *Alternativas:*\n${alts}\n\n----------\n\n`;
  }

  if (data.pros && data.pros.length > 0) {
    md += `✅ *Pros:*\n• ${data.pros.join('\n• ')}\n\n----------\n\n`;
  }

  if (data.contras && data.contras.length > 0) {
    md += `⚠️ *Contras:*\n• ${data.contras.join('\n• ')}\n\n----------`;
  }

  return md;
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
      // NUEVO: Inicializamos el cliente de Supabase
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
      
      const reportData = JSON.parse(content);

      // NUEVO: Lógica de "Actualizar o Crear" (Upsert) en la base de datos
      const { error: upsertError } = await supabase
        .from('reports')
        .upsert({
          url_oficial: reportData.url_oficial, // Usamos la URL como clave única
          last_searched_at: new Date().toISOString(),
          nombre: reportData.nombre,
          descripcion_corta: reportData.descripcion_corta,
          categorias: reportData.categorias,
          publico_objetivo: reportData.publico_objetivo,
          caracteristicas_clave: reportData.caracteristicas_clave,
          precio: reportData.precio,
          alternativas: reportData.alternativas,
          pros: reportData.pros,
          contras: reportData.contras,
        }, { onConflict: 'url_oficial' });

      if (upsertError) {
        // Si falla la base de datos, lo registramos pero continuamos para no afectar a Slack
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