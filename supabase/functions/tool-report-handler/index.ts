// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR, SIMULAR O ADIVINAR INFORMACIÓN.

**Reglas de Contenido y Formato:**
* Cuando un dato no se encuentre, el campo debe contener ÚNICAMENTE las letras N/A, sin ninguna explicación adicional.
* Para las listas con viñetas ('Categorías', 'Público objetivo', 'Características clave', 'Alternativas', 'Pros', 'Contras'), DEBES proporcionar un **mínimo de 1 y un máximo de 4** de los puntos más relevantes.
* El campo 'Precio' es de formato libre; reporta la información que encuentres.

**Proceso de Investigación y Verificación Obligatorio:**
1.  **Paso 1 (Investigación Inicial):** Realiza una búsqueda exhaustiva en internet sobre la URL proporcionada para obtener la información necesaria para el informe.
2.  **Paso 2 (Autoverificación de la Descripción):** Después de escribir la 'Descripción corta', realiza una segunda búsqueda cruzada para CONFIRMAR que la descripción corresponde a la URL proporcionada y no a otra empresa con un nombre similar. Si es incorrecta, debes corregirla.

Aplica esta plantilla de reporte:

----------  

*Nombre:*
<nombre_real_de_la_aplicacion>

----------  

🌐 *URL oficial:*
<url_oficial>

----------  

*Descripción corta:*
<descripcion_detallada_breve_y_precisa_VERIFICADA>

----------  

📂 *Categorías:*
• <categoría relevante>

----------  

🎯 *Público objetivo:*
• <público relevante>

----------  

✨ *Características clave:*
• <característica relevante>

----------  

💰 *Precio:*
<modelo_de_precios_y_detalles>

----------  

🔄 *Alternativas:*
1. *<nombre_alternativa_1>* — <url_1>  

----------  

✅ *Pros:*
• <ventaja relevante>

----------  

⚠️ *Contras:*
• <desventaja relevante>

---------- 

🤖 *Lógica Aplicada:*
<Resumen del proceso de análisis y verificación en menos de 100 tokens>

----------`;

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