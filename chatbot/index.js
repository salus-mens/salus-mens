// --- ASISTENTE VIRTUAL: punto de entrada ---
// server.js llama a montar(app, db). Cada parte se activa solo si su configuración está en .env.
const agenda = require('./agenda');
const asistente = require('./asistente');
const canales = require('./canales');

function montar(app, db) {
    const conGoogle = agenda.iniciar(db);
    const conIA = asistente.iniciar(db);
    canales.iniciar(db);
    app.use(canales.crearRutas());

    const estado = (activo) => (activo ? 'activo' : 'sin configurar');
    const modo = process.env.CHATBOT_MODO === 'menu' || !conIA ? 'menú automático (sin IA)' : 'IA con respaldo de menú';
    console.log(`Asistente virtual · Modo: ${modo} · IA: ${estado(conIA)} · Google Calendar: ${estado(conGoogle)}`
        + ` · WhatsApp: ${estado(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)}`
        + ` · Messenger/Instagram: ${estado(process.env.META_PAGE_TOKEN || process.env.INSTAGRAM_TOKEN)}`);
}

module.exports = { montar };
