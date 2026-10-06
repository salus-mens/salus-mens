# Asistente virtual de Salus Mens: guía de configuración

El asistente responde con inteligencia artificial (Claude) los mensajes de **WhatsApp**, **Facebook Messenger** e **Instagram**. Además:

- consulta los horarios libres;
- agenda la cita en el **Google Calendar** del consultorio;
- envía la notificación de cita y los datos de pago, con el formato de tus respuestas rápidas;
- te avisa por correo de cada cita, comprobante o caso que necesita tu atención.

Cada parte funciona por separado: puedes empezar por la IA, después Google Calendar y al final WhatsApp.

---

## 0. Datos del consultorio (sin programar)

Abre [`chatbot/config.json`](../chatbot/config.json) y revisa:

- **`horario`**: días y horas en que se puede agendar, duración de la consulta (60 min) y anticipación mínima (3 h).
- **`valores`** y **`abono_porcentaje`**: precios y abono del 50 %.
- **`pago`**: **completa `banco` y `tipo_cuenta`**, que no estaban en tus mensajes. Mientras estén vacíos, el asistente no los menciona.

Después de cambiar algo, reinicia el servidor.

## 1. Inteligencia artificial (Claude)

1. Entra a <https://console.anthropic.com>, crea una cuenta, carga saldo (Billing) y crea una clave en **API Keys**.
2. Crea el archivo `.env` (copiando `.env.example`) y pega la clave en `ANTHROPIC_API_KEY=`.
3. Prueba el asistente en la terminal, como si fueras un paciente:

   ```
   npm run chatbot
   ```

   Las citas de prueba se guardan en `chatbot-prueba.db`, aparte de las reales.

**Costo aproximado:** unos centavos de dólar por conversación completa. Las instrucciones fijas se guardan en caché y cuestan una fracción en cada mensaje. Puedes ver el gasto en la consola de Anthropic y ponerle un límite mensual.

## 2. Google Calendar del consultorio

1. Entra a <https://console.cloud.google.com> con la cuenta de Google del consultorio y crea un proyecto (por ejemplo, "Salus Mens").
2. **APIs y servicios → Biblioteca** → busca **Google Calendar API** → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**. Ponle un nombre, por ejemplo "asistente".
4. Abre la cuenta de servicio → **Claves → Agregar clave → JSON**. Se descarga un archivo: guárdalo en la carpeta del proyecto como **`google-cuenta-servicio.json`**. Nunca lo compartas; ya está excluido de git.
5. En **Google Calendar** (calendar.google.com): **Configuración → tu calendario → Compartir con determinadas personas** → agrega el correo de la cuenta de servicio (termina en `@...iam.gserviceaccount.com`) con permiso **"Realizar cambios en eventos"**.
6. En `.env`, pon en `GOOGLE_CALENDAR_ID` el correo de Gmail del consultorio.

**Cómo aparecen las citas en el calendario:**

| Estado | Color del evento | Título |
|---|---|---|
| Abono pendiente | Amarillo | `· ABONO PENDIENTE` |
| Comprobante recibido | Naranja | `· COMPROBANTE POR VERIFICAR` |

Cuando verifiques el pago, cambia el color o quita esa parte del título. Google te notifica en el celular como cualquier evento.

## 3. Avisos por correo

Si ya configuraste el correo SMTP (sección del correo en `.env`), recibirás en `CHATBOT_AVISOS_CORREO` un aviso por cada:

- nueva cita;
- cancelación;
- comprobante;
- paciente que pide hablar contigo.

Los casos **urgentes**, como una persona en crisis, llegan marcados como **URGENTE**. Cada aviso incluye el enlace para abrir el chat de WhatsApp con esa persona.

## 4. Publicar el asistente en internet

Meta necesita un enlace **HTTPS encendido las 24 horas** a donde enviar los mensajes. Netlify no sirve para esto, porque solo publica páginas. Tienes dos opciones:

- **Para probar:** con tu computadora encendida y `npm start` corriendo, abre otra terminal y ejecuta:

  ```
  npx cloudflared tunnel --url http://127.0.0.1:5050
  ```

  Te da un enlace temporal `https://….trycloudflare.com` que cambia cada vez que lo ejecutas.
- **Para usarlo de verdad:** sube el proyecto a un hosting con disco permanente, como Railway, Render con disco o un VPS pequeño (unos 5–7 USD al mes). Allí también funcionarán el inicio de sesión y "Mi espacio" de la página.

Tu enlace para Meta será: `https://TU-DIRECCION/webhooks/meta`

## 5. WhatsApp (prioridad)

1. Entra a <https://developers.facebook.com> → **Crear app → Empresa** → agrega el producto **WhatsApp**.
2. Meta te da un **número de prueba**. Úsalo primero para probar sin afectar tu número real.
3. En **WhatsApp → Configuración de la API** copia el **Identificador del número de teléfono** en `WHATSAPP_PHONE_NUMBER_ID`.
4. **Token permanente:** en <https://business.facebook.com> → **Configuración del negocio → Usuarios del sistema** → crea uno → **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Pégalo en `WHATSAPP_TOKEN`.
5. En la app de Meta, **Configuración de la app → Básica**: copia la **Clave secreta** en `META_APP_SECRET` y el **Identificador de la app** en `META_APP_ID`.
6. Inventa una palabra secreta y ponla en `META_VERIFY_TOKEN`.
7. **WhatsApp → Configuración → Webhook**:
   - **URL de devolución de llamada:** `https://TU-DIRECCION/webhooks/meta`
   - **Token de verificación:** la palabra del paso 6
   - Suscríbete al campo **`messages`**.
8. Reinicia el servidor y escribe al número de prueba desde tu celular.

**Antes de usar tu número real (0987746826), ten en cuenta:**

- Si hoy lo usas en la app **WhatsApp Business**, al conectarlo a la API normalmente deja de funcionar en la app, salvo que Meta te ofrezca la opción de **"coexistencia"** al registrarlo, que mantiene ambos. Revisa esa opción al agregar el número. Si no aparece, considera usar un número nuevo para el asistente.
- Meta pide **verificar el negocio** (RUC o documentos) para quitar los límites de la cuenta de prueba.
- Responder a mensajes que te escriben los pacientes no tiene costo de WhatsApp. Enviar mensajes por iniciativa propia, como recordatorios, sí, y requiere plantillas aprobadas por Meta.

## 6. Facebook Messenger e Instagram

1. En la misma app de Meta agrega el producto **Messenger**.
2. Conecta tu **página de Facebook** y genera su token: pégalo en `META_PAGE_TOKEN`.
3. Vincula tu **cuenta profesional de Instagram** a esa página. En la app de Instagram activa **Configuración → Mensajes → Permitir acceso a los mensajes**.
4. En los webhooks de Messenger y de Instagram usa la misma URL y el mismo token del paso 5. Suscríbete a **`messages`** y **`message_echoes`**.
5. Para que funcione con cualquier persona, y no solo con los administradores de la app, Meta exige una **revisión de la app** con los permisos `pages_messaging` e `instagram_manage_messages`. Tarda unos días.

**Responder tú en persona:** si contestas a alguien desde la bandeja de Meta Business Suite, el asistente lo detecta y **se calla con esa persona durante 12 horas**, para no interrumpir tu conversación.

## 7. TikTok

TikTok **no permite** que programas externos lean ni respondan mensajes directos. La alternativa es poner en tu biografía de TikTok el enlace a WhatsApp, y ahí responde el asistente:

<https://wa.me/593987746826>

---

## Qué hace y qué no hace el asistente

- **Se presenta** como asistente virtual del centro y trata de "usted", con tus saludos y cierres habituales.
- **Pide los datos** de tu plantilla: nombres, edad, motivo por área y horario de preferencia. Con la edad y el motivo elige el tipo de consulta ($15 o $18) y calcula el abono.
- **Solo ofrece horarios realmente libres**, revisando tu Google Calendar y las citas ya agendadas. Nunca agenda dos citas a la misma hora.
- **No da diagnósticos ni consejos clínicos.**
- **Ante una crisis o riesgo** (por ejemplo, ideas de hacerse daño), indica llamar al **ECU 911** y te avisa como **URGENTE**.
- **Si piden hablar contigo**, tienen un reclamo o es un caso especial, te avisa por correo.
- **No puede escuchar audios.** Pide amablemente que escriban.
- **No puede verificar pagos:** marca el comprobante como "por verificar" y te avisa.

**Datos personales:** las conversaciones y citas se guardan en tu base de datos, y los mensajes se procesan con la API de Anthropic. Por la Ley Orgánica de Protección de Datos Personales del Ecuador, conviene publicar un aviso de privacidad en la página y en tu perfil de WhatsApp que lo mencione.
