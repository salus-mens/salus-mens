// Conversa con el asistente virtual desde la terminal, como si fueras un paciente en WhatsApp.
// Uso:  npm run chatbot            (usa la IA si hay clave en .env; si falla, el menú automático)
//       npm run chatbot -- --menu  (solo el menú automático, sin IA y sin costo)
// Usa una base de datos aparte (chatbot-prueba.db) para no mezclar citas de prueba con las reales.
// Ojo: si Google Calendar está configurado en .env, las citas de prueba SÍ se crean en el calendario.
const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');

if (process.argv.includes('--menu')) process.env.CHATBOT_MODO = 'menu';
// Para no enviar correos reales durante la prueba
delete process.env.SMTP_HOST;

const agenda = require('../chatbot/agenda');
const asistente = require('../chatbot/asistente');
const canales = require('../chatbot/canales');

const db = new Database(path.join(__dirname, '..', 'chatbot-prueba.db'));
const conGoogle = agenda.iniciar(db);
const conIA = asistente.iniciar(db);
canales.iniciar(db);

const usuario = 'prueba-' + Date.now();
const modo = process.env.CHATBOT_MODO === 'menu' || !conIA ? 'menú automático (sin IA)' : 'IA (con menú de respaldo)';
console.log(`Asistente de Salus Mens · modo prueba · ${modo} · Google Calendar: ${conGoogle ? 'activo' : 'sin configurar'}`);
console.log('Escribe como si fueras un paciente. Para salir escribe "salir".\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'Tú: ' });
rl.prompt();
rl.on('line', async (linea) => {
    const texto = linea.trim();
    if (texto.toLowerCase() === 'salir') return rl.close();
    if (!texto) return rl.prompt();
    rl.pause();
    try {
        const respuesta = await canales.responderMensaje({ canal: 'prueba', usuario, nombreContacto: 'Paciente de prueba', texto });
        for (const parte of [].concat(respuesta)) console.log(`\nAsistente: ${parte}\n`);
    } catch (error) {
        console.error('\nError:', error.message, '\n');
    }
    rl.resume();
    rl.prompt();
});
