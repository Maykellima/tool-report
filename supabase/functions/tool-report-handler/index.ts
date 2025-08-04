// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR, SIMULAR O ADIVINAR INFORMACIÓN. Tu respuesta SIEMPRE debe basarse en los resultados de tu búsqueda en tiempo real. Si no encuentras un dato, rellena el campo con "N/A".

Dada una URL, realiza una investigación online y rellena la siguiente plantilla:

----------  

*Nombre:*
<nombre_real_de_la_aplicacion>

----------  

🌐 *URL oficial:*
<url_oficial>

----------  

*Descripción corta:*
<descripcion_detallada_breve_y_precisa>

----------  

📂 *Categorías:*
• <categoría relevante>
• <categoría relevante>

----------  

🎯 *Público objetivo:*
• <público relevante>
• <público relevante>

----------  

✨ *Características clave:*
• <característica relevante>
• <característica relevante>

----------  

💡 *Caso de uso:*
<Ejemplo práctico de cómo un usuario podría usar esta herramienta para resolver un problema real>

----------  

💰 *Precio:*
<modelo_de_precios>
<detalles_específicos>

----------  

🔄 *Alternativas:*
1. *<nombre_alternativa_1>* — <url_1>  
2. *<nombre_alternativa_2>* — <url_2>

----------  

✅ *Pros:*
• <ventaja relevante>
• <ventaja relevante>

----------  

⚠️ *Contras:*
• <desventaja relevante>
• <desventaja relevante>

----------  

🔍 *Coincidencia web vs internet:*
•  <porcentaje>%

---------- 

🔗 *Fuentes consultadas:*
• <URL de la fuente 1>
• <URL de la fuente 2>
• <URL de la fuente 3>

----------`;

serve(async (req) => {
  // Leemos la nueva clave de API de Perplexity
  const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;

  // Modelo online de Perplexity recomendado
  const model = 'llama-3-sonar-large-32k-online';

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '🏁 Iniciando Reporte con Perplexity...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  (async () => {
    try {
      // La estructura del body para Perplexity es un array de "messages"
      const requestBody = {
        model: model,
        messages: [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": `Por favor, sigue tus instrucciones para la siguiente URL y completa el informe: ${commandText}` }
        ]
      };

      // Hacemos la llamada al endpoint de la API de Perplexity
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
      // La respuesta de Perplexity está en data.choices[0].message.content
      const content = data.choices[0].message.content;
      
      let md = content;
      if (content.includes('----------')) {
          const start = content.indexOf('----------');
          md = start >= 0 ? content.slice(start).trim() : content.trim();
      }

      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'in_channel', text: md }),
      });

    } catch (error) {
      console.error('Error en el análisis con Perplexity:', error);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ Ocurrió un error al procesar el análisis con Perplexity: ${error.message}`,
        }),
      });
    }
  })();

  return initialResponse;
});