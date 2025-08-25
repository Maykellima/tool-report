// Archivo: supabase/functions/tool-report-handler/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SYSTEM_PROMPT = `Tu misión es ser un analista experto de herramientas digitales. Tu regla de oro es NUNCA INVENTAR, SIMULAR O ADIVINAR INFORMACIÓN.

**Reglas de Contenido y Formato:**
* Cuando un dato no se encuentre, el campo debe contener ÚNICAMENTE las letras N/A, sin ninguna explicación adicional.
* Para las listas con viñetas ('Categoría', 'Público objetivo', 'Características clave', 'Alternativas', 'Pros', 'Contras'), DEBES proporcionar un **mínimo de 1 y un máximo de 4** de los puntos más relevantes.
* El campo 'Precio' es de formato libre; reporta la información que encuentres.

**Proceso de Investigación Obligatorio:**
1.  **Paso 1 (Fuente Primaria):** Tu fuente principal de información es la URL proporcionada. Analízala a fondo primero.
2.  **Paso 2 (Contraste Externo):** DEBES contrastar y enriquecer la información obtenida del Paso 1 realizando búsquedas en **fuentes externas fiables y especializadas** que sean relevantes para el sector de la herramienta analizada.

**Instrucción para 'Coincidencia web vs usuarios':**
* Estima un porcentaje que refleje la consistencia entre la información de la web oficial y las opiniones/datos de usuarios en fuentes externas.

Aplica esta plantilla de reporte:

----------  

*Nombre:*
<nombre_real_de_la_aplicacion>

----------  

🌐 *URL oficial:*
<url_oficial>

----------  

✍️ *Descripción corta:*
<descripcion_detallada_breve_y_precisa>

----------  

📂 *Categoría:*
• <categoría relevante>

----------  

🎯 *Público objetivo:*
• <público relevante>

----------  

✨ *Características clave:*
• <característica relevante>

----------  

👀 *Caso de uso:*
<Ejemplo posible de caso de uso real.>

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

📊 *Coincidencia web vs usuarios:*
• <porcentaje>%

----------

🔗 *Fuentes consultadas:*
• <https://fuente1.com|Título de la Fuente 1>

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
      text: '🏁 Iniciando Reporte con Perplexity Sonar Pro...',
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