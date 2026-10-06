// --- CONEXIÓN CON WHATSAPP, MESSENGER E INSTAGRAM (Meta) ---
// Meta avisa de cada mensaje nuevo a  POST /webhooks/meta  (un solo enlace para las tres redes).
// Se responde a Meta de inmediato y el mensaje se procesa después, para que Meta no lo reenvíe.
// Configuración en .env (ver .env.example): META_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_TOKEN,
// WHATSAPP_PHONE_NUMBER_ID, META_PAGE_TOKEN (Messenger/Instagram) e INSTAGRAM_TOKEN (opcional).
const crypto = require('crypto');
const express = require('express');
const asistente = require('./asistente');
const notificar = require('./notificar');
const respuestas = require('./respuestas');

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v26.0'}`;
const PAUSA_MS = 12 * 60 * 60 * 1000; // si el psicólogo responde a mano, el asistente se calla 12 h con esa persona

let db = null;

function iniciar(baseDeDatos) {
    db = baseDeDatos;
    respuestas.iniciar(db);
    db.exec(`
      CREATE TABLE IF NOT EXISTS chatbot_procesados (id TEXT PRIMARY KEY, fecha INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chatbot_pausas (conversacion TEXT PRIMARY KEY, hasta INTEGER NOT NULL);
    `);
}

// --- Seguridad: solo se aceptan avisos firmados por Meta con el secreto de la app ---
function firmaValida(req) {
    const secreto = process.env.META_APP_SECRET;
    if (!secreto) return false;
    const firma = req.get('x-hub-signature-256') || '';
    const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(req.rawBody || '').digest('hex');
    return firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}

function yaProcesado(id) {
    db.prepare('DELETE FROM chatbot_procesados WHERE fecha < ?').run(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return db.prepare('INSERT OR IGNORE INTO chatbot_procesados (id, fecha) VALUES (?, ?)').run(id, Date.now()).changes === 0;
}

const pausado = (conversacion) => {
    const fila = db.prepare('SELECT hasta FROM chatbot_pausas WHERE conversacion = ?').get(conversacion);
    return Boolean(fila && fila.hasta > Date.now());
};
const pausar = (conversacion) => db.prepare(`INSERT INTO chatbot_pausas (conversacion, hasta) VALUES (?, ?)
    ON CONFLICT(conversacion) DO UPDATE SET hasta = excluded.hasta`).run(conversacion, Date.now() + PAUSA_MS);

// --- Traducir lo que llega de Meta a { canal, usuario, nombreContacto, texto, id } ---
function textoDeWhatsApp(m) {
    switch (m.type) {
        case 'text': return m.text.body;
        case 'image': return `[El paciente envió una imagen${m.image.caption ? ` con el texto: "${m.image.caption}"` : ''}]`;
        case 'document': return `[El paciente envió un documento${m.document.filename ? ` (${m.document.filename})` : ''}]`;
        case 'audio': return '[El paciente envió un audio. Aún no puedes escuchar audios: pídele con amabilidad que escriba su mensaje.]';
        case 'interactive': return (m.interactive.button_reply || m.interactive.list_reply || {}).title || '[Respuesta de botón]';
        case 'button': return m.button.text;
        case 'location': return '[El paciente compartió una ubicación]';
        default: return `[El paciente envió un mensaje de tipo ${m.type}]`;
    }
}

function textoDeMeta(mensaje) {
    if (mensaje.text) return mensaje.text;
    const adjunto = (mensaje.attachments || [])[0];
    if (!adjunto) return null;
    if (adjunto.type === 'image') return '[El paciente envió una imagen]';
    if (adjunto.type === 'audio') return '[El paciente envió un audio. Aún no puedes escuchar audios: pídele con amabilidad que escriba su mensaje.]';
    return `[El paciente envió un archivo de tipo ${adjunto.type}]`;
}

function leerAviso(cuerpo) {
    const recibidos = [];
    for (const entrada of cuerpo.entry || []) {
        if (cuerpo.object === 'whatsapp_business_account') {
            for (const cambio of entrada.changes || []) {
                const valor = cambio.value || {};
                const nombres = Object.fromEntries((valor.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
                for (const m of valor.messages || []) {
                    recibidos.push({ canal: 'whatsapp', usuario: m.from, nombreContacto: nombres[m.from], texto: textoDeWhatsApp(m), id: m.id });
                }
            }
        } else if (cuerpo.object === 'page' || cuerpo.object === 'instagram') {
            const canal = cuerpo.object === 'page' ? 'messenger' : 'instagram';
            for (const evento of entrada.messaging || []) {
                const mensaje = evento.message;
                if (!mensaje) continue;
                if (mensaje.is_echo) {
                    // Mensaje enviado por la página: si no lo mandó el asistente, lo escribió una persona del centro
                    if (String(mensaje.app_id || '') !== String(process.env.META_APP_ID || '')) {
                        pausar(`${canal}:${evento.recipient.id}`);
                    }
                    continue;
                }
                const texto = textoDeMeta(mensaje);
                if (texto) recibidos.push({ canal, usuario: evento.sender.id, texto, id: mensaje.mid });
            }
        }
    }
    return recibidos;
}

// --- Enviar respuestas ---
function trozos(texto, maximo) {
    const partes = [];
    let resto = texto;
    while (resto.length > maximo) {
        let corte = resto.lastIndexOf('\n', maximo);
        if (corte < maximo / 2) corte = resto.lastIndexOf(' ', maximo);
        if (corte < 1) corte = maximo;
        partes.push(resto.slice(0, corte).trim());
        resto = resto.slice(corte).trim();
    }
    if (resto) partes.push(resto);
    return partes;
}

async function llamarGraph(url, cuerpo, token) {
    const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cuerpo)
    });
    if (!respuesta.ok) throw new Error(`Meta respondió ${respuesta.status}: ${await respuesta.text()}`);
}

async function enviar(canal, usuario, contenido) {
    // Puede llegar una lista de textos: se envían como mensajes separados, en orden
    if (Array.isArray(contenido)) {
        for (const texto of contenido) await enviar(canal, usuario, texto);
        return;
    }
    const texto = respuestas.adaptar(contenido, canal);
    if (canal === 'whatsapp') {
        for (const parte of trozos(texto, 4000)) {
            await llamarGraph(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
                { messaging_product: 'whatsapp', to: usuario, type: 'text', text: { body: parte, preview_url: false } },
                process.env.WHATSAPP_TOKEN);
        }
        return;
    }
    const instagramDirecto = canal === 'instagram' && process.env.INSTAGRAM_TOKEN;
    const url = instagramDirecto
        ? `https://graph.instagram.com/${process.env.META_GRAPH_VERSION || 'v26.0'}/me/messages`
        : `${GRAPH}/me/messages`;
    for (const parte of trozos(texto, 1000)) {
        await llamarGraph(url, { recipient: { id: usuario }, messaging_type: 'RESPONSE', message: { text: parte } },
            instagramDirecto ? process.env.INSTAGRAM_TOKEN : process.env.META_PAGE_TOKEN);
    }
}

// Envía una imagen PNG (por ejemplo, la confirmación de la cita) con un texto al pie.
// WhatsApp y Messenger: se sube el archivo. Instagram: se envía por enlace (requiere BASE_URL pública).
async function enviarImagen(canal, usuario, png, { pie = '', enlacePublico = '' } = {}) {
    const archivo = new Blob([png], { type: 'image/png' });
    if (canal === 'whatsapp') {
        const formulario = new FormData();
        formulario.append('messaging_product', 'whatsapp');
        formulario.append('type', 'image/png');
        formulario.append('file', archivo, 'cita-salus-mens.png');
        const subida = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: formulario
        });
        if (!subida.ok) throw new Error(`Meta respondió ${subida.status} al subir la imagen: ${await subida.text()}`);
        const { id } = await subida.json();
        await llamarGraph(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            { messaging_product: 'whatsapp', to: usuario, type: 'image', image: { id, caption: pie.slice(0, 1000) } },
            process.env.WHATSAPP_TOKEN);
        return;
    }
    if (canal === 'messenger') {
        const formulario = new FormData();
        formulario.append('recipient', JSON.stringify({ id: usuario }));
        formulario.append('messaging_type', 'RESPONSE');
        formulario.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: false } } }));
        formulario.append('filedata', archivo, 'cita-salus-mens.png');
        const r = await fetch(`${GRAPH}/me/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.META_PAGE_TOKEN}` }, body: formulario });
        if (!r.ok) throw new Error(`Meta respondió ${r.status} al enviar la imagen: ${await r.text()}`);
    } else if (canal === 'instagram' && enlacePublico) {
        const instagramDirecto = Boolean(process.env.INSTAGRAM_TOKEN);
        await llamarGraph(instagramDirecto ? `https://graph.instagram.com/${process.env.META_GRAPH_VERSION || 'v26.0'}/me/messages` : `${GRAPH}/me/messages`,
            { recipient: { id: usuario }, message: { attachment: { type: 'image', payload: { url: enlacePublico } } } },
            instagramDirecto ? process.env.INSTAGRAM_TOKEN : process.env.META_PAGE_TOKEN);
    }
    if (pie) await enviar(canal, usuario, pie);
}

function marcarLeido(id) {
    llamarGraph(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        { messaging_product: 'whatsapp', status: 'read', message_id: id }, process.env.WHATSAPP_TOKEN)
        .catch(() => { /* no es importante si falla */ });
}

async function atender(m) {
    const conversacion = `${m.canal}:${m.usuario}`;
    if (yaProcesado(m.id) || pausado(conversacion)) return;
    if (m.canal === 'whatsapp') marcarLeido(m.id);
    try {
        await enviar(m.canal, m.usuario, await responderMensaje(m));
    } catch (error) {
        console.error(`[Chatbot] No se pudo responder a ${conversacion}:`, error.message);
    }
}

// Con IA si está disponible; si no (o si falla, por ejemplo sin saldo), con el menú automático
let ultimoAvisoFalla = 0;
async function responderMensaje(m) {
    if (process.env.CHATBOT_MODO !== 'menu' && asistente.activo()) {
        try {
            const respuesta = await asistente.responder(m);
            if (respuesta) return respuesta;
        } catch (error) {
            console.error('[Chatbot] La IA falló, se usa el menú automático:', error.message);
            if (Date.now() - ultimoAvisoFalla > 6 * 60 * 60 * 1000) { // como máximo un aviso cada 6 horas
                ultimoAvisoFalla = Date.now();
                notificar.derivacion({ motivo: `La IA no está respondiendo (${error.message.slice(0, 150)}). Mientras tanto se usan las respuestas automáticas del menú. Si es por saldo, recarga en console.anthropic.com → Billing.`, urgente: false }, m);
            }
        }
    }
    return respuestas.responder(m);
}

// --- Rutas ---
function crearRutas() {
    const rutas = express.Router();

    // Meta comprueba el enlace una vez al configurarlo
    rutas.get('/webhooks/meta', (req, res) => {
        const token = process.env.META_VERIFY_TOKEN;
        if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
            return res.status(200).send(String(req.query['hub.challenge'] || ''));
        }
        res.sendStatus(403);
    });

    rutas.post('/webhooks/meta', (req, res) => {
        if (!firmaValida(req)) return res.sendStatus(401);
        res.sendStatus(200); // se confirma de inmediato
        for (const mensaje of leerAviso(req.body || {})) atender(mensaje);
    });

    return rutas;
}

module.exports = { iniciar, crearRutas, leerAviso, trozos, firmaValida, responderMensaje, enviar, enviarImagen };
