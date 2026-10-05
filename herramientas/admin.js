// Da o quita el permiso de administrador (acceso al panel /admin de publicaciones).
// Uso:
//   npm run admin -- salus._mens            → lo hace administrador
//   npm run admin -- correo@ejemplo.com     → también funciona con el correo
//   npm run admin -- salus._mens --quitar   → le quita el permiso
//   npm run admin                           → lista los administradores
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'usuarios.db'));

// La misma columna que crea server.js, por si el servidor aún no se ha iniciado con esta versión
if (!db.prepare('PRAGMA table_info(usuarios)').all().some((columna) => columna.name === 'admin')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
}

const [identificador, opcion] = process.argv.slice(2).map((valor) => valor.trim().toLowerCase());

if (!identificador) {
    const admins = db.prepare('SELECT nombre, usuario, email FROM usuarios WHERE admin = 1').all();
    console.log(admins.length ? 'Administradores:' : 'Todavía no hay administradores.');
    admins.forEach((a) => console.log(`  - ${a.nombre} (${a.usuario || 'sin usuario'}, ${a.email})`));
    process.exit(0);
}

const columna = identificador.includes('@') ? 'email' : 'usuario';
const usuario = db.prepare(`SELECT id, nombre FROM usuarios WHERE ${columna} = ?`).get(identificador);
if (!usuario) {
    console.error(`No existe una cuenta con ${columna === 'email' ? 'el correo' : 'el usuario'} "${identificador}".`);
    console.error('Primero se debe registrar en /login.html#registro.');
    process.exit(1);
}

const esAdmin = opcion === '--quitar' ? 0 : 1;
db.prepare('UPDATE usuarios SET admin = ? WHERE id = ?').run(esAdmin, usuario.id);
console.log(esAdmin
    ? `Listo: ${usuario.nombre} ahora es administrador y puede entrar al panel /admin.`
    : `Listo: ${usuario.nombre} ya no es administrador.`);
