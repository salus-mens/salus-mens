// Cambia la contraseña de una cuenta de la página (por ejemplo, el administrador salus._mens).
// Uso (en la carpeta de la página):
//   npm run clave -- salus._mens          → genera una contraseña segura y la muestra UNA vez
//   npm run clave -- salus._mens --escribir → pide que escriba la nueva contraseña (no se ve en pantalla)
// Guarde la contraseña en el Sistema Salus Mens → «Página web y accesos».
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const readline = require('readline');

const db = new Database(path.join(__dirname, '..', 'usuarios.db'));
const [identificador, opcion] = process.argv.slice(2).map((valor) => valor.trim());

// Mismas reglas que server.js: mínimo 8 caracteres, letras y números, máximo 72 bytes.
const valida = (clave) => clave.length >= 8 && Buffer.byteLength(clave) <= 72 && /[A-Za-z]/.test(clave) && /\d/.test(clave);

function generar() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const numeros = '23456789';
    const todos = letras + numeros;
    let clave = '';
    while (!valida(clave) || !/[A-Z]/.test(clave) || !/[a-z]/.test(clave)) {
        clave = Array.from(crypto.randomBytes(16), (b) => todos[b % todos.length]).join('');
    }
    return clave;
}

function preguntarOculto(texto) {
    return new Promise((resolver) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(s); };
        rl.question(texto, (respuesta) => { rl.close(); process.stdout.write('\n'); resolver(respuesta); });
    });
}

(async () => {
    if (!identificador) {
        console.error('Indique el usuario o correo. Ejemplo: npm run clave -- salus._mens');
        process.exit(1);
    }

    const columna = identificador.includes('@') ? 'email' : 'usuario';
    const usuario = db.prepare(`SELECT id, nombre FROM usuarios WHERE ${columna} = ?`).get(identificador.toLowerCase());
    if (!usuario) {
        console.error(`No existe una cuenta con ${columna === 'email' ? 'el correo' : 'el usuario'} "${identificador}".`);
        process.exit(1);
    }

    let clave;
    if (opcion === '--escribir') {
        clave = await preguntarOculto('Nueva contraseña: ');
        const repetida = await preguntarOculto('Repítala: ');
        if (clave !== repetida) { console.error('Las contraseñas no coinciden. No se cambió nada.'); process.exit(1); }
        if (!valida(clave)) { console.error('Debe tener al menos 8 caracteres, letras y números. No se cambió nada.'); process.exit(1); }
    } else {
        clave = generar();
    }

    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(await bcrypt.hash(clave, 10), usuario.id);

    console.log(`\nListo: se cambió la contraseña de ${usuario.nombre} (${identificador}).`);
    if (opcion !== '--escribir') {
        console.log(`\n   Nueva contraseña:  ${clave}\n`);
        console.log('Cópiela ahora y guárdela en el Sistema Salus Mens → «Página web y accesos».');
        console.log('No se volverá a mostrar.');
    }
})();
