# Tool-report Slack Bot 🤖

Un bot de Slack que utiliza un LLM para generar análisis detallados de herramientas digitales a partir de una URL.

## ✨ Características

* **Integración con Slack:** Funciona a través de un simple comando de barra diagonal: `/tool_report`.
* **Análisis con IA:** Utiliza el modelo **GPT-4o de OpenAI** para analizar el contenido de cualquier URL proporcionada.
* **Arquitectura Serverless:** Construido sobre **Supabase Edge Functions** para una ejecución rápida y sin "arranque en frío" (cold starts).
* **Procesamiento Asíncrono:** Responde instantáneamente a Slack para evitar timeouts y procesa el análisis en segundo plano, publicando el resultado cuando está listo.

## 🛠️ Stack Tecnológico

* **Backend:** [Supabase Edge Functions](https://supabase.com/docs/guides/functions) (Deno, TypeScript)
* **IA:** [OpenAI API](https://platform.openai.com/docs/overview) (GPT-4o)
* **Plataforma:** [Slack API](https://api.slack.com/)

---
## 🚀 Instalación y Configuración

Sigue estos pasos para desplegar tu propia instancia del bot.

### Prerrequisitos
* Una cuenta de [Supabase](https://supabase.com).
* Una cuenta de [OpenAI](https://platform.openai.com) con créditos de API.
* Un Workspace de [Slack](https://slack.com) con permisos de administrador.
* [Deno](https://deno.land/) y la [Supabase CLI](https://supabase.com/docs/guides/cli) instaladas localmente.

### Pasos

1.  **Clonar el Repositorio**
    ```bash
    git clone [https://github.com/](https://github.com/)<tu_usuario_de_github>/tool-report.git
    cd tool-report
    ```

2.  **Crear un Proyecto en Supabase**
    * Ve a tu [Dashboard de Supabase](https://supabase.com/dashboard/projects) y crea un nuevo proyecto.
    * Guarda el **Reference ID** y la **contraseña de la base de datos**.

3.  **Configurar la App de Slack**
    * Ve a [api.slack.com/apps](https://api.slack.com/apps) y crea una nueva app llamada `Tool_report`.
    * Ve a **"Slash Commands"** y crea un nuevo comando: `/tool_report`.
    * En **"OAuth & Permissions"**, añade el scope `commands`.
    * Instala la app en tu workspace.
    * En **"Basic Information"**, copia el **Signing Secret**.

4.  **Configuración Local**
    * Vincula tu proyecto local con el de Supabase:
        ```bash
        supabase link --project-ref <tu-project-ref>
        ```
    * Copia tus claves secretas. Necesitarás tu **Slack Signing Secret** y tu **OpenAI API Key**.
    * Añade los secretos a Supabase:
        ```bash
        supabase secrets set SLACK_SIGNING_SECRET=<tu-slack-signing-secret>
        supabase secrets set OPENAI_API_KEY=<tu-openai-api-key>
        ```

5.  **Desplegar la Función**
    * Ejecuta el comando de despliegue:
        ```bash
        supabase functions deploy tool-report-handler --no-verify-jwt
        ```

6.  **Actualizar la URL en Slack**
    * Copia la URL de la función que te ha devuelto el comando anterior.
    * Vuelve a la configuración de tu comando `/tool_report` en Slack y pega la URL en el campo **Request URL**. Guarda los cambios.

---
## Usage

Una vez configurado, puedes usar el bot en cualquier canal de tu workspace de Slack:

/tool_report https://www.notion.so

El bot primero enviará un mensaje de confirmación y, poco después, publicará el análisis completo en el canal.
