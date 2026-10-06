// --- AVISOS AL CENTRO ---
// Cuando el asistente agenda, cancela, recibe un comprobante o deriva un caso, avisa por correo
// (cuenta SMTP del archivo .env) y lo muestra en la consola del servidor.
const nodemailer = require('nodemailer');
const CONFIG = require('./config.json');

const destino = process.env.CHATBOT_AVISOS_CORREO || CONFIG.correo;
const transporte = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    : null;

const CANALES = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', prueba: 'Prueba' };

function contacto(ctx) {
    const canal = CANALES[ctx.canal] || ctx.canal;
    const enlace = ctx.canal === 'whatsapp' ? `\nAbrir chat: https://wa.me/${ctx.usuario}` : '';
    return `Canal: ${canal} · ${ctx.nombreContacto || 'sin nombre'} (${ctx.usuario})${enlace}`;
}

function enviar(asunto, texto) {
    console.log(`\n[Aviso] ${asunto}\n${texto}\n`);
    if (!transporte) return;
    transporte.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destino,
        subject: `Asistente Salus Mens · ${asunto}`,
        text: texto
    }).catch((error) => console.error('[Aviso] No se pudo enviar el correo:', error.message));
}

const resumenCita = (c) => `${c.nombre} (${c.edad} años) · ${c.inicio.replace('T', ' ')} · ${c.modalidad}\n`
    + `Motivo: ${c.motivo_area}${c.motivo_detalle ? ' — ' + c.motivo_detalle : ''}\n`
    + `Valor: $${c.valor.toFixed(2)} · Abono: $${c.abono.toFixed(2)}`;

module.exports = {
    nuevaCita: (c, ctx) => enviar(`Nueva reserva: ${c.nombre}`, `${resumenCita(c)}\n\n${contacto(ctx)}\n\nEstado: reservada, esperando el abono.`),
    citaCancelada: (c, ctx) => enviar(`Cita cancelada: ${c.nombre}`, `${resumenCita(c)}\n\n${contacto(ctx)}`),
    comprobante: (c, ctx) => enviar(`Comprobante por verificar: ${c.nombre}`,
        `El paciente envió el comprobante del abono. Revísalo en el chat, verifícalo con el banco y confirma la cita en el panel:\n`
        + `${process.env.BASE_URL || 'http://127.0.0.1:5050'}/admin-citas\n\n${resumenCita(c)}\n\n${contacto(ctx)}`),
    derivacion: (d, ctx) => enviar(`${d.urgente ? 'URGENTE · ' : ''}Comunicarse con un paciente`,
        `${d.motivo}\n\n${contacto(ctx)}`)
};
