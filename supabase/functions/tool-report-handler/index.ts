// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla MÁS IMPORTANTE es NUNCA INVENTAR INFORMACIÓN. Para las listas (Categorías, Público Objetivo, Características, etc.), proporciona solo los puntos más relevantes que encuentres, con un máximo de 6 por sección. Si solo encuentras 2, pon solo 2.

Sigue estas instrucciones en orden:

1.  **Análisis Primario:** Primero, basa tu análisis en el CONTENIDO HTML que se te proporciona. La URL original se te da como referencia principal.

2.  **Plan B - Búsqueda Externa:** Si el contenido HTML es insuficiente (ej. está vacío, es una página de carga, o tiene bloqueadores de bots) o no te da la información necesaria, DEBES realizar una búsqueda en internet sobre la herramienta o empresa de la URL. Busca en fuentes fiables como artículos de tecnología, foros y medios especializados para obtener una descripción precisa y actualizada.

3.  **Regla Final:** Si después de ambos pasos no encuentras un dato específico, DEBES usar "N/A". Bajo ningún concepto puedes usar tu conocimiento interno de entrenamiento o simular una respuesta.

Genera el informe siguiendo EXACTAMENTE esta plantilla:

----------  

*Nombre:*
<nombre_real_de_la_aplicacion>

----------  

🌐 *URL oficial:*
<url_oficial>

----------  

*Descripción corta:*
<descripcion_breve_y_precisa>

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

💰 *Precios:*
<modelo_de_precios> — <detalles_específicos>

----------  

🔄 *Alternativas:*
1. *<nombre_alternativa_1>* — <url_1>  
2. *<nombre_alternativa_2>* — <url_2>

----------  

✅ *Ventajas:*
• <ventaja relevante>
• <ventaja relevante>

----------  

⚠️ *Desventajas:*
• <desventaja relevante>
• <desventaja relevante>

----------  

⭐ *Puntuación general:*
<puntuacion>/5

----------  

🔍 *Validación externa:*
• Coincidencia web vs internet: <porcentaje>%

----------  

🗓️ *Última actualización:*
<SOLO la fecha AAAA-MM-DD si la encuentras explícitamente, si no, pon "N/A">

---------- 

IMPORTANTE: Reitero, no inventes ni simules datos. Si un campo, especialmente la fecha de actualización, no es claramente visible y verificable, la única respuesta válida es "N/A".`;

serve(async (req) => {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '✅ Petición recibida. Analizando la URL, esto puede tardar hasta 1 minuto...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Ejecución en segundo plano
  (async () => {
    try {
      let webContent = 'No se pudo acceder al contenido de la página.';
      try {
        const webResponse = await fetch(commandText);
        if (webResponse.ok) {
          const html = await webResponse.text();
          webContent = html.substring(0, 15000); // Limitamos el contenido para no exceder límites
        }
      } catch (scrapeError) {
        console.error('Error al scrapear la web:', scrapeError);
        webContent = `Error al acceder a la URL: ${scrapeError.message}`;
      }

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analiza la herramienta basándote en el contenido de su web que te proporciono a continuación. URL original: ${commandText}. \n\n CONTENIDO EXTRAÍDO DE LA WEB: \n\n ${webContent}` }
      ];

      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages,
          temperature: 0.1,
        }),
      });

      if (!openAIResponse.ok) {
        throw new Error(`La API de OpenAI respondió con un error: ${openAIResponse.statusText}`);
      }

      const data = await openAIResponse.json();
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