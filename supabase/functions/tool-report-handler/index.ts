// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR, SIMULAR O ADIVINAR INFORMACIÓN.

Tu ÚNICA fuente de información es la URL proporcionada. No puedes buscar en ningún otro sitio de internet. Toda tu respuesta debe basarse exclusivamente en la información contenida en esa página.

CASO DE FALLO: Si al intentar acceder a la URL te encuentras con un bloqueo (error, captcha, acceso denegado, etc.), DEBES detener el análisis y rellenar CADA UNO de los campos del informe con el texto: "La web ha bloqueado el acceso".

Si no encuentras un dato específico en la página, DEBES rellenar ese campo con "N/A".

Aplica esta plantilla de reporte:

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
`;

serve(async (req) => {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;

  const model = 'gemini-1.5-pro-latest';

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '🏁 Iniciando Reporte (Modo Fuente Única)...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  (async () => {
    try {
      const requestBody = {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [{
          parts: [{
            text: `Por favor, sigue tus instrucciones para la siguiente URL y completa el informe: ${commandText}`
          }]
        }]
      };

      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        throw new Error(`La API de Gemini respondió con un error: ${geminiResponse.statusText}. Detalles: ${errorBody}`);
      }

      const data = await geminiResponse.json();
      const content = data.candidates[0].content.parts[0].text;
      
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
      console.error('Error en el análisis con Gemini:', error);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `❌ Ocurrió un error al procesar el análisis con Gemini: ${error.message}`,
        }),
      });
    }
  })();

  return initialResponse;
});