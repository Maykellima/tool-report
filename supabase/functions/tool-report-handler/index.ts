// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla MÁS IMPORTANTE es NUNCA INVENTAR INFORMACIÓN.

Sigue estas instrucciones en orden:

1.  **Análisis Primario (Búsqueda Externa):** Realiza una búsqueda en internet sobre la herramienta o empresa de la URL proporcionada. Busca en fuentes fiables como artículos de tecnología, foros y medios especializados para obtener una descripción precisa y actualizada. La URL es el tema de tu investigación.

2.  **Regla Final:** Si después de tu búsqueda no encuentras un dato específico, DEBES usar "N/A". Bajo ningún concepto puedes usar tu conocimiento interno de entrenamiento o simular una respuesta.

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

  const initialResponse = new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: '✅ Petición recibida. Analizando con Gemini, esto puede tardar hasta 1 minuto...',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Ejecución en segundo plano
  (async () => {
    try {
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${SYSTEM_PROMPT}\n\nAnaliza la herramienta en la siguiente URL: ${commandText}`
            }]
          }]
        }),
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