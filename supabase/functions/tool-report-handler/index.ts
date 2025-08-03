// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es actuar como un investigador experto de herramientas digitales. Tu regla MÁS IMPORTANTE es NUNCA INVENTAR INFORMACIÓN.

Dada una URL, tu tarea principal es realizar una búsqueda exhaustiva en internet para encontrar información actualizada y fiable sobre la herramienta digital asociada a esa URL. Busca en fuentes fiables como artículos de tecnología, foros (Reddit, Product Hunt), y medios especializados.

Si después de tu búsqueda no encuentras un dato específico, DEBES usar "N/A". Bajo ningún concepto puedes usar tu conocimiento interno de entrenamiento o simular una respuesta.

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

✍️ *Metodología de Análisis:*
<Explicación de CÓMO se obtuvo la información. Ejemplo: "Búsqueda externa realizada. Fuentes principales: [artículo de TechCrunch], [hilo de Reddit]">

---------- 

IMPORTANTE: Reitero, no inventes ni simules datos. Si un campo no es claramente visible y verificable, la única respuesta válida es "N/A".`;

serve(async (req) => {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const formData = await req.formData();
  const commandText = formData.get('text') as string;
  const responseUrl = formData.get('response_url') as string;

  const model = 'gemini-1.5-pro-latest'; // Definimos el modelo en una constante

  // Usamos la constante del modelo en el mensaje de respuesta inicial
  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: `✅ Petición recibida. Analizando con ${model}, esto puede tardar hasta 1 minuto...`,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Ejecución en segundo plano
  (async () => {
    try {
      // Estructura correcta que separa las instrucciones del sistema de la tarea
      const requestBody = {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [{
          parts: [{
            text: `Por favor, investiga en internet la herramienta asociada a la siguiente URL y completa el informe: ${commandText}`
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