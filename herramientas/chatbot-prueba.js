// Conversa con el asistente virtual desde la terminal, como si fueras un paciente en WhatsApp.
// Uso:  npm run chatbot
// Usa una base de datos aparte (chatbot-prueba.db) para no mezclar citas de prueba con las reales.
// Ojo: si Google Calendar está configurado en .env, las citas de prueba SÍ se crean en el calendario.
const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');
const agenda = require('../chatbot/agenda');
const asistente = require('../chatbot/asistente');

const db = new Database(path.join(__dirname, '..', 'chatbot-prueba.db'));
const conGoogle = agenda.iniciar(db);
if (!asistente.iniciar(db)) {
    console.error('Falta ANTHROPIC_API_KEY en el archivo .env (ver .env.example).');
    process.exit(1);
}

const usuario = 'prueba-' + Date.now();
console.log(`Asistente de Salus Mens (modo prueba) · Google Calendar: ${conGoogle ? 'activo' : 'sin configurar'}`);
console.log('Escribe como si fueras un paciente. Para salir escribe "salir".\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'Tú: ' });
rl.prompt();
rl.on('line', async (linea) => {
    const texto = linea.trim();
    if (texto.toLowerCase() === 'salir') return rl.close();
    if (!texto) return rl.prompt();
    rl.pause();
    try {
        const respuesta = await asistente.responder({ canal: 'prueba', usuario, nombreContacto: 'Paciente de prueba', texto });
        console.log(`\nAsistente: ${respuesta}\n`);
    } catch (error) {
        console.error('\nError:', error.message, '\n');
    }
    rl.resume();
    rl.prompt();
});
