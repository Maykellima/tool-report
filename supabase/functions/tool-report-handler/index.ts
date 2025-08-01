// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SYSTEM_PROMPT = `Tu única y más importante regla es NUNCA INVENTAR INFORMACIÓN. Eres un analista de herramientas digitales que solo usa datos verificables. Si no encuentras un dato específico en la web, DEBES usar "N/A". Analiza la URL proporcionada y sigue EXACTAMENTE esta plantilla:

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
• <categorias_1>
• <categorias_2>
• <categorias_3>
• <categorias_4>

----------  

🎯 *Público objetivo:*
<publicos_1>
<publicos_2>
<publicos_3>
<publicos_4>

----------  

✨ *Características clave:*
• <caracteristica_1>  
• <caracteristica_2>  
• <caracteristica_3>
• <caracteristica_4>

----------  

💰 *Precios:*
<modelo_de_precios>
<detalles_específicos>

----------  

🔄 *Alternativas:*
1. *<nombre_alternativa_1>* — <url_1>  
2. *<nombre_alternativa_2>* — <url_2>

----------  

✅ *Ventajas:*
• <ventaja_1>  
• <ventaja_2>
• <ventaja_3>

----------  

⚠️ *Desventajas:*
• <desventaja_1>  
• <desventaja_2>
• <desventaja_3>

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

// Función principal que se ejecuta al recibir una petición de Slack
serve(async (req) => {
  // Extraemos las variables de entorno de Supabase de forma segura
  const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  // Parseamos la petición de Slack
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;
  
  // Respondemos inmediatamente a Slack para evitar el timeout de 3 segundos
  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '✅ Petición recibida. El análisis puede tardar hasta 1 minuto...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // La función continúa ejecutándose en segundo plano después de responder
  (async () => {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Analiza la herramienta en la siguiente URL: ${commandText}` }
      ];

      // Llamada a la API de OpenAI
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
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
      const start = content.indexOf('----------');
      const md = start >= 0 ? content.slice(start).trim() : content.trim();

      // Enviamos el resultado final a Slack usando la response_url
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'in_channel',
          text: md,
        }),
      });

    } catch (error) {
      console.error('Error en el análisis:', error);
      // Si algo falla, se lo notificamos al usuario
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