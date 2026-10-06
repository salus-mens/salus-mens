const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { parsePhoneNumberFromString } = require('libphonenumber-js/mobile');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'usuarios.db'));

// 5050 y no 3000 ni 8080: la vista previa en vivo de VS Code suele ocupar el 3000 y respondería en lugar de este servidor
const PORT = process.env.PORT || 5050;
const HOST = '0.0.0.0'; // Permite el acceso desde otros dispositivos de la red local
const DURACION_ENLACE_MS = 60 * 60 * 1000; // El enlace para recuperar la contraseña dura 1 hora
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // La sesión dura 8 horas
// Clave para firmar la cookie de sesión. Configúrala en .env para que las sesiones sobrevivan a un reinicio.
const SECRETO_SESION = process.env.SESION_SECRETO || crypto.randomBytes(32).toString('hex');

// Secciones del área exclusiva y los tipos de pedido que acepta cada una
const SECCIONES = {
    talleres: ['Taller para padres', 'Taller para docentes', 'Taller para profesionales', 'Taller para empresas'],
    librerias: ['Recurso para padres', 'Recurso para profesionales de salud mental'],
    software: ['Test psicológico digital', 'Página web', 'Herramienta educativa'],
    promociones: ['Promoción de un servicio', 'Paquete de sesiones', 'Convenio institucional']
};

const MAX_INTENTOS = 5; // Intentos fallidos de preguntas de seguridad antes de bloquear
const BLOQUEO_MS = 15 * 60 * 1000; // Duración del bloqueo: 15 minutos

// Preguntas de seguridad (los números deben coincidir con las opciones de public/login.html)
const PREGUNTAS = {
    1: '¿Cuál es el nombre de tu primera mascota?',
    2: '¿En qué ciudad naciste?',
    3: '¿Cómo se llamaba tu escuela primaria?',
    4: '¿Cuál es el segundo nombre de tu madre?',
    5: '¿Cuál fue tu primer trabajo?',
    6: '¿Cuál era tu comida favorita en la infancia?',
    7: '¿Cómo se llamaba tu mejor amigo/a de la infancia?',
    8: '¿En qué calle vivías de niño/a?'
};

// Configuración para leer formularios y JSON
app.use(express.urlencoded({ extended: true }));
// Se guarda el cuerpo original para comprobar la firma de los avisos de Meta (asistente virtual)
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));

// Servir los archivos estáticos de tu HTML/CSS
// El panel de publicaciones (/admin) solo se abre con una cuenta de administrador.
// Va antes de express.static para que el panel no se entregue sin revisar la sesión.
app.use('/admin', requiereAdmin);

app.use(express.static(path.join(__dirname, 'public')));

// --- SESIÓN (cookie firmada, sin guardar datos sensibles en el navegador) ---
// La cookie lleva "id.expira.firma"; la firma HMAC impide que alguien la modifique.
function firmar(texto) {
    return crypto.createHmac('sha256', SECRETO_SESION).update(texto).digest('hex');
}

function crearSesion(res, req, usuarioId) {
    const datos = `${usuarioId}.${Date.now() + DURACION_SESION_MS}`;
    res.cookie('sesion', `${datos}.${firmar(datos)}`, {
        httpOnly: true, // El JavaScript de la página no puede leerla
        sameSite: 'lax', // Protege los formularios de envíos desde otros sitios
        secure: req.secure,
        maxAge: DURACION_SESION_MS
    });
}

function leerSesion(req) {
    const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('sesion='));
    if (!cookie) return null;
    const [id, expira, firma] = decodeURIComponent(cookie.slice(7)).split('.');
    const esperada = firmar(`${id}.${expira}`);
    if (!firma || firma.length !== esperada.length
        || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))
        || Number(expira) < Date.now()) {
        return null;
    }
    return db.prepare('SELECT id, nombre, email, usuario, admin FROM usuarios WHERE id = ?').get(Number(id)) || null;
}

function requiereAdmin(req, res, next) {
    req.usuario = leerSesion(req);
    if (!req.usuario) return res.redirect(303, '/login.html?volver=' + encodeURIComponent(req.originalUrl));
    if (!req.usuario.admin) {
        return paginaRespuesta(res, 403, 'Acceso restringido', 'Esta sección es solo para administradores del centro.');
    }
    next();
}

function requiereSesion(req, res, next) {
    req.usuario = leerSesion(req);
    if (!req.usuario) return res.redirect(303, '/login.html?volver=' + encodeURIComponent(req.originalUrl));
    next();
}

// Área exclusiva: solo se sirve con sesión iniciada (carpeta "privado", fuera de "public")
app.use('/miembros', requiereSesion, express.static(path.join(__dirname, 'privado')));

// Datos de la sesión actual (para mostrar el nombre en el área exclusiva)
app.get('/api/sesion', (req, res) => {
    const usuario = leerSesion(req);
    if (!usuario) return res.status(401).json({ error: 'Sin sesión' });
    res.json({ nombre: usuario.nombre });
});

// Cerrar sesión
app.get('/api/salir', (req, res) => {
    res.clearCookie('sesion');
    res.redirect(303, '/login.html');
});

// --- CREACIÓN DE TABLAS EN SQLITE ---
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    servicio TEXT,
    mensaje TEXT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recuperaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    token_hash TEXT UNIQUE NOT NULL,
    expira INTEGER NOT NULL
  );
`);

// Columna "usuario" (nombre de usuario opcional para iniciar sesión sin correo).
// SQLite no permite agregar una columna UNIQUE, por eso la unicidad va en un índice aparte.
if (!db.prepare('PRAGMA table_info(usuarios)').all().some((columna) => columna.name === 'usuario')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN usuario TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)');

// Celular en formato internacional E.164 (ej. +593987746826)
if (!db.prepare('PRAGMA table_info(usuarios)').all().some((columna) => columna.name === 'celular')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN celular TEXT');
}

// Permiso de administrador (1 = puede entrar al panel /admin). Se asigna con: npm run admin -- <usuario o correo>
if (!db.prepare('PRAGMA table_info(usuarios)').all().some((columna) => columna.name === 'admin')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
}

// Preguntas de seguridad: solo se guarda el hash de cada respuesta
db.exec(`
  CREATE TABLE IF NOT EXISTS preguntas_seguridad (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    pregunta_id INTEGER NOT NULL,
    respuesta_hash TEXT NOT NULL,
    PRIMARY KEY (usuario_id, pregunta_id)
  );
`);

// Pedidos hechos desde el área exclusiva
db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    seccion TEXT NOT NULL,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    caracteristicas TEXT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- VALIDACIÓN DE DATOS (mismas reglas que public/scripts/formularios.js) ---
const validar = {
    nombre: (valor) => valor.length >= 3 && valor.length <= 100 && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/.test(valor),
    email: (valor) => valor.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor),
    usuario: (valor) => /^[a-z0-9._-]{3,30}$/.test(valor),
    // Celular válido para el país elegido (todos los países). Devuelve el número en formato E.164 o null.
    celular: (valor, pais) => {
        const numero = parsePhoneNumberFromString(valor, /^[A-Z]{2}$/.test(pais) ? pais : undefined);
        return numero && numero.isValid() ? numero.number : null;
    },
    pregunta: (valor) => Object.hasOwn(PREGUNTAS, valor),
    respuesta: (valor) => valor.length >= 2 && valor.length <= 60,
    // bcrypt solo usa los primeros 72 bytes, por eso se limita el largo
    passwordNueva: (valor) => valor.length >= 8 && Buffer.byteLength(valor) <= 72 && /[A-Za-z]/.test(valor) && /\d/.test(valor),
    mensaje: (valor) => valor.length >= 10 && valor.length <= 2000
};

// --- UTILIDADES ---

// Evita que el texto escrito por el usuario se interprete como HTML (XSS)
function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Limpia un campo de formulario: siempre devuelve texto sin espacios sobrantes
function limpiar(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
}

// Las contraseñas no se recortan: los espacios también cuentan
function leerPassword(valor) {
    return typeof valor === 'string' ? valor : '';
}

// Las respuestas se comparan sin mayúsculas, tildes ni espacios extra ("Quito " = "quito")
function normalizarRespuesta(valor) {
    return limpiar(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

// Guarda solo el hash del código de recuperación: si alguien copia la base de datos, no puede usarlo
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Página de respuesta con el mismo diseño del sitio
function paginaRespuesta(res, estado, titulo, mensaje, enlace = { href: '/index.html', texto: 'VOLVER AL INICIO' }) {
    res.status(estado).send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escaparHtml(titulo)} | Centro Psicológico Salus Mens</title>
    <link rel="icon" href="/Images/Logo.png">
    <link rel="stylesheet" href="/styles/css/styles.css">
    <script src="/scripts/tema.js"></script>
</head>
<body class="pagina-interna">
    <main class="contenido-pagina">
        <section class="respuesta ventana tono-mint">
            <h1>${escaparHtml(titulo)}</h1>
            <p>${escaparHtml(mensaje)}</p>
            <a href="${enlace.href}" class="boton">${enlace.texto}</a>
        </section>
    </main>
</body>
</html>`);
}

// --- ENVÍO DE CORREOS ---
// Se configura con variables de entorno en el archivo .env (ver .env.example).
// Si no hay configuración, el enlace se muestra en la consola del servidor (útil para pruebas).
const transporte = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    : null;

async function enviarEnlaceRecuperacion(usuario, enlace) {
    if (!transporte) {
        console.log(`[Recuperar contraseña] ${usuario.email}: ${enlace}`);
        return;
    }
    await transporte.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: usuario.email,
        subject: 'Recupera tu contraseña - Salus Mens',
        text: `Hola, ${usuario.nombre}:\n\nPara crear una nueva contraseña abre este enlace (válido por 1 hora):\n${enlace}\n\nSi no lo solicitaste, ignora este correo.\n\nCentro Psicológico Salus Mens`,
        html: `<p>Hola, ${escaparHtml(usuario.nombre)}:</p>
               <p>Para crear una nueva contraseña pulsa el siguiente enlace (válido por 1 hora):</p>
               <p><a href="${enlace}">Crear nueva contraseña</a></p>
               <p>Si no lo solicitaste, ignora este correo.</p>
               <p>Centro Psicológico Salus Mens</p>`
    });
}

// --- RUTA 1: REGISTRO DE USUARIOS ---
app.post('/api/registro', async (req, res) => {
    const nombre = limpiar(req.body.nombre);
    const email = limpiar(req.body.email).toLowerCase();
    const celular = validar.celular(limpiar(req.body.celular), limpiar(req.body.pais));
    const password = leerPassword(req.body.password);
    const confirmar = leerPassword(req.body.confirmar);
    const preguntas = [
        { id: limpiar(req.body.pregunta1), respuesta: normalizarRespuesta(req.body.respuesta1) },
        { id: limpiar(req.body.pregunta2), respuesta: normalizarRespuesta(req.body.respuesta2) }
    ];
    const volver = { href: '/login.html#registro', texto: 'VOLVER' };

    if (!validar.nombre(nombre) || !validar.email(email) || !validar.passwordNueva(password)) {
        return paginaRespuesta(res, 400, 'Datos no válidos', 'Revisa tu nombre (solo letras), tu correo y que la contraseña tenga al menos 8 caracteres con letras y números.', volver);
    }
    if (!celular) {
        return paginaRespuesta(res, 400, 'Celular no válido', 'Elige tu país y escribe un número de celular válido.', volver);
    }
    if (password !== confirmar) {
        return paginaRespuesta(res, 400, 'Las contraseñas no coinciden', 'Escribe la misma contraseña en los dos campos.', volver);
    }
    if (!preguntas.every((p) => validar.pregunta(p.id) && validar.respuesta(p.respuesta)) || preguntas[0].id === preguntas[1].id) {
        return paginaRespuesta(res, 400, 'Preguntas de seguridad incompletas', 'Elige dos preguntas distintas y respóndelas (entre 2 y 60 caracteres).', volver);
    }

    try {
        // Encriptar contraseña y respuestas por seguridad
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashesRespuestas = await Promise.all(preguntas.map((p) => bcrypt.hash(p.respuesta, 10)));

        // Se guarda todo junto: si algo falla, no queda una cuenta a medias
        db.transaction(() => {
            const { lastInsertRowid } = db.prepare('INSERT INTO usuarios (nombre, email, password, celular) VALUES (?, ?, ?, ?)')
                .run(nombre, email, hashedPassword, celular);
            const guardarPregunta = db.prepare('INSERT INTO preguntas_seguridad (usuario_id, pregunta_id, respuesta_hash) VALUES (?, ?, ?)');
            preguntas.forEach((p, i) => guardarPregunta.run(lastInsertRowid, Number(p.id), hashesRespuestas[i]));
        })();

        paginaRespuesta(res, 201, '¡Registro exitoso!', `Bienvenido/a, ${nombre}. Ya puedes iniciar sesión.`, { href: '/login.html', texto: 'INICIAR SESIÓN' });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return paginaRespuesta(res, 409, 'Correo ya registrado', 'Ya existe una cuenta con este correo electrónico.', volver);
        }
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos completar el registro. Inténtalo más tarde.', volver);
    }
});

// --- RUTA 2: INICIO DE SESIÓN ---
app.post('/api/login', async (req, res) => {
    // Se puede entrar con el correo o con el nombre de usuario
    const identificador = limpiar(req.body.identificador).toLowerCase();
    const password = leerPassword(req.body.password);
    const volver = { href: '/login.html', texto: 'VOLVER' };
    const esCorreo = identificador.includes('@');

    if (!(esCorreo ? validar.email(identificador) : validar.usuario(identificador)) || !password) {
        return paginaRespuesta(res, 400, 'Datos incompletos', 'Escribe tu correo o usuario y tu contraseña.', volver);
    }

    try {
        const stmt = db.prepare(`SELECT * FROM usuarios WHERE ${esCorreo ? 'email' : 'usuario'} = ?`);
        const usuario = stmt.get(identificador);

        // Mismo mensaje en ambos casos para no revelar qué cuentas existen
        if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
            return paginaRespuesta(res, 401, 'Datos incorrectos', 'El usuario o la contraseña no son correctos.', volver);
        }

        crearSesion(res, req, usuario.id);
        // Vuelve a la página que pidió el inicio de sesión (solo rutas internas del sitio)
        const volver = limpiar(req.body.volver);
        res.redirect(303, /^\/(?![\/\\])[\w\-./]*$/.test(volver) ? volver : '/miembros/');
    } catch (error) {
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos iniciar tu sesión. Inténtalo más tarde.', volver);
    }
});

// --- RUTA 3: OLVIDÉ MI CONTRASEÑA (envía un enlace temporal al correo) ---
app.post('/api/olvide', async (req, res) => {
    const email = limpiar(req.body.email).toLowerCase();
    const volver = { href: '/login.html#olvide', texto: 'VOLVER' };

    if (!validar.email(email)) {
        return paginaRespuesta(res, 400, 'Correo no válido', 'Escribe un correo electrónico válido.', volver);
    }

    try {
        const usuario = db.prepare('SELECT id, nombre, email FROM usuarios WHERE email = ?').get(email);

        if (usuario) {
            const token = crypto.randomBytes(32).toString('hex');

            // Solo el último enlace solicitado sigue siendo válido
            db.prepare('DELETE FROM recuperaciones WHERE usuario_id = ? OR expira < ?').run(usuario.id, Date.now());
            db.prepare('INSERT INTO recuperaciones (usuario_id, token_hash, expira) VALUES (?, ?, ?)')
                .run(usuario.id, hashToken(token), Date.now() + DURACION_ENLACE_MS);

            // Con correo real se usa siempre BASE_URL: la cabecera Host de la petición podría estar falsificada
            const base = process.env.BASE_URL || (transporte ? `http://localhost:${PORT}` : `${req.protocol}://${req.get('host')}`);
            await enviarEnlaceRecuperacion(usuario, `${base}/restablecer.html?token=${token}`);
        }
    } catch (error) {
        console.error('No se pudo enviar el enlace de recuperación:', error);
    }

    // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados
    paginaRespuesta(res, 200, 'Revisa tu correo', 'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña. El enlace es válido por 1 hora.', { href: '/login.html', texto: 'VOLVER A INICIAR SESIÓN' });
});

// --- RUTA 4: GUARDAR LA NUEVA CONTRASEÑA ---
app.post('/api/restablecer', async (req, res) => {
    const token = limpiar(req.body.token);
    const password = leerPassword(req.body.password);
    const confirmar = leerPassword(req.body.confirmar);
    const enlaceInvalido = { href: '/login.html#olvide', texto: 'SOLICITAR NUEVO ENLACE' };

    const recuperacion = /^[a-f0-9]{64}$/.test(token)
        ? db.prepare('SELECT * FROM recuperaciones WHERE token_hash = ? AND expira > ?').get(hashToken(token), Date.now())
        : null;

    if (!recuperacion) {
        return paginaRespuesta(res, 400, 'Enlace no válido', 'El enlace ya se usó o expiró. Solicita uno nuevo.', enlaceInvalido);
    }

    const volver = { href: `/restablecer.html?token=${token}`, texto: 'VOLVER' };
    if (!validar.passwordNueva(password)) {
        return paginaRespuesta(res, 400, 'Contraseña no válida', 'Debe tener al menos 8 caracteres con letras y números.', volver);
    }
    if (password !== confirmar) {
        return paginaRespuesta(res, 400, 'Las contraseñas no coinciden', 'Escribe la misma contraseña en los dos campos.', volver);
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashedPassword, recuperacion.usuario_id);
        db.prepare('DELETE FROM recuperaciones WHERE usuario_id = ?').run(recuperacion.usuario_id);

        paginaRespuesta(res, 200, 'Contraseña actualizada', 'Ya puedes iniciar sesión con tu nueva contraseña.', { href: '/login.html', texto: 'INICIAR SESIÓN' });
    } catch (error) {
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos guardar tu contraseña. Inténtalo más tarde.', volver);
    }
});

// --- RUTA 4b: RECUPERAR LA CONTRASEÑA CON PREGUNTAS DE SEGURIDAD ---

// Intentos fallidos por cuenta (en memoria: se reinician si se reinicia el servidor)
const intentosFallidos = new Map();

function estaBloqueado(identificador) {
    const registro = intentosFallidos.get(identificador);
    return Boolean(registro && registro.hasta > Date.now());
}

function registrarFallo(identificador) {
    const registro = intentosFallidos.get(identificador) || { fallos: 0, hasta: 0 };
    registro.fallos += 1;
    if (registro.fallos >= MAX_INTENTOS) {
        registro.fallos = 0;
        registro.hasta = Date.now() + BLOQUEO_MS;
    }
    intentosFallidos.set(identificador, registro);
    return registro.hasta > Date.now() ? 0 : MAX_INTENTOS - registro.fallos;
}

function buscarUsuario(identificador) {
    const columna = identificador.includes('@') ? 'email' : 'usuario';
    return db.prepare(`SELECT * FROM usuarios WHERE ${columna} = ?`).get(identificador);
}

// Preguntas de una cuenta. Si la cuenta no existe (o no tiene preguntas) se devuelven dos preguntas
// elegidas a partir del identificador, siempre las mismas: así no se puede averiguar qué cuentas existen.
function preguntasDe(identificador) {
    const usuario = buscarUsuario(identificador);
    const guardadas = usuario
        ? db.prepare('SELECT pregunta_id, respuesta_hash FROM preguntas_seguridad WHERE usuario_id = ? ORDER BY rowid').all(usuario.id)
        : [];
    if (guardadas.length === 2) return { usuario, guardadas };

    const ids = Object.keys(PREGUNTAS).map(Number);
    const semilla = crypto.createHash('sha256').update(identificador).digest();
    const primera = ids[semilla[0] % ids.length];
    const restantes = ids.filter((id) => id !== primera);
    return { usuario: null, guardadas: [primera, restantes[semilla[1] % restantes.length]].map((id) => ({ pregunta_id: id })) };
}

// Paso 1: devuelve las preguntas de la cuenta
app.get('/api/preguntas', (req, res) => {
    const identificador = limpiar(req.query.identificador).toLowerCase();
    if (!(identificador.includes('@') ? validar.email(identificador) : validar.usuario(identificador))) {
        return res.status(400).json({ error: 'Escribe un correo o usuario válido.' });
    }
    if (estaBloqueado(identificador)) {
        return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' });
    }
    const { guardadas } = preguntasDe(identificador);
    res.json({ preguntas: guardadas.map((p) => PREGUNTAS[p.pregunta_id]) });
});

// Paso 2: comprueba las respuestas y guarda la nueva contraseña
app.post('/api/restablecer-preguntas', async (req, res) => {
    const identificador = limpiar(req.body.identificador).toLowerCase();
    const respuestas = [normalizarRespuesta(req.body.respuesta1), normalizarRespuesta(req.body.respuesta2)];
    const password = leerPassword(req.body.password);
    const confirmar = leerPassword(req.body.confirmar);
    const volver = { href: '/login.html#preguntas', texto: 'VOLVER' };

    if (estaBloqueado(identificador)) {
        return paginaRespuesta(res, 429, 'Recuperación bloqueada', 'Hubo demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.', volver);
    }
    if (!validar.passwordNueva(password)) {
        return paginaRespuesta(res, 400, 'Contraseña no válida', 'Debe tener al menos 8 caracteres con letras y números.', volver);
    }
    if (password !== confirmar) {
        return paginaRespuesta(res, 400, 'Las contraseñas no coinciden', 'Escribe la misma contraseña en los dos campos.', volver);
    }

    try {
        const { usuario, guardadas } = preguntasDe(identificador);
        let correctas = Boolean(usuario);
        for (let i = 0; i < 2 && correctas; i++) {
            correctas = await bcrypt.compare(respuestas[i], guardadas[i].respuesta_hash);
        }

        if (!correctas) {
            const restantes = registrarFallo(identificador);
            const aviso = restantes > 0
                ? `Te quedan ${restantes} intento(s) antes de un bloqueo de 15 minutos.`
                : 'Por seguridad, la recuperación quedó bloqueada 15 minutos.';
            return paginaRespuesta(res, 401, 'Respuestas incorrectas', `Las respuestas no coinciden con las registradas. ${aviso}`, volver);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashedPassword, usuario.id);
        db.prepare('DELETE FROM recuperaciones WHERE usuario_id = ?').run(usuario.id);
        intentosFallidos.delete(identificador);

        paginaRespuesta(res, 200, 'Contraseña actualizada', 'Ya puedes iniciar sesión con tu nueva contraseña.', { href: '/login.html', texto: 'INICIAR SESIÓN' });
    } catch (error) {
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos guardar tu contraseña. Inténtalo más tarde.', volver);
    }
});

// --- RUTA 5: SUSCRIPCIONES (BOLETÍN/NEWSLETTER) ---
app.post('/api/suscribirse', (req, res) => {
    const email = limpiar(req.body.email).toLowerCase();
    const volver = { href: '/blog.html', texto: 'VOLVER AL BLOG' };

    if (!validar.email(email)) {
        return paginaRespuesta(res, 400, 'Correo no válido', 'Escribe un correo electrónico válido.', volver);
    }

    try {
        const stmt = db.prepare('INSERT INTO suscripciones (email) VALUES (?)');
        stmt.run(email);
        paginaRespuesta(res, 201, '¡Gracias por suscribirte!', 'Recibirás nuestros nuevos artículos en tu correo.', volver);
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return paginaRespuesta(res, 409, 'Ya estás suscrito/a', 'Este correo ya forma parte de nuestro boletín.', volver);
        }
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos registrar tu suscripción. Inténtalo más tarde.', volver);
    }
});

// --- RUTA 6: MENSAJES DEL FORMULARIO DE CONTACTO ---
app.post('/api/contacto', (req, res) => {
    const nombre = limpiar(req.body.nombre);
    const email = limpiar(req.body.email).toLowerCase();
    const telefonoEscrito = limpiar(req.body.telefono);
    const telefono = telefonoEscrito ? validar.celular(telefonoEscrito, limpiar(req.body.pais)) : '';
    const servicio = limpiar(req.body.servicio).slice(0, 100);
    const mensaje = limpiar(req.body.mensaje);
    const volver = { href: '/contacto.html', texto: 'VOLVER' };

    if (!validar.nombre(nombre) || !validar.email(email) || !validar.mensaje(mensaje) || telefono === null) {
        return paginaRespuesta(res, 400, 'Datos no válidos', 'Revisa tu nombre (solo letras), tu correo, el celular (según el país elegido) y que el mensaje tenga al menos 10 caracteres.', volver);
    }

    try {
        const stmt = db.prepare('INSERT INTO mensajes (nombre, email, telefono, servicio, mensaje) VALUES (?, ?, ?, ?, ?)');
        stmt.run(nombre, email, telefono, servicio, mensaje);
        paginaRespuesta(res, 201, '¡Mensaje enviado!', `Gracias, ${nombre}. Nos pondremos en contacto contigo pronto.`);
    } catch (error) {
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos enviar tu mensaje. Inténtalo más tarde.', volver);
    }
});

// --- PRUEBA LOCAL DE LOS FORMULARIOS DE NETLIFY ---
// En Netlify, los formularios de Contactos y del boletín los recibe Netlify Forms y te llegan por correo.
// En la computadora no existe Netlify: se muestra el envío en la consola y se pasa a la página de agradecimiento.
app.post('/gracias.html', (req, res) => {
    const { 'form-name': formulario, 'bot-field': trampa, ...datos } = req.body;
    if (!trampa) console.log(`[Formulario "${formulario}" (en Netlify llegará a tu correo)]`, datos);
    res.redirect(303, '/gracias.html');
});

// --- RUTA 7: PEDIDOS DEL ÁREA EXCLUSIVA ---
app.post('/api/pedidos', requiereSesion, (req, res) => {
    const seccion = limpiar(req.body.seccion);
    const tipo = limpiar(req.body.tipo);
    const nombre = limpiar(req.body.nombre);
    const caracteristicas = limpiar(req.body.caracteristicas);
    const volver = { href: Object.hasOwn(SECCIONES, seccion) ? `/miembros/${seccion}.html` : '/miembros/', texto: 'VOLVER' };

    if (!Object.hasOwn(SECCIONES, seccion) || !SECCIONES[seccion].includes(tipo)) {
        return paginaRespuesta(res, 400, 'Tipo no válido', 'Elige uno de los tipos de pedido de la lista.', volver);
    }
    if (nombre.length < 3 || nombre.length > 100 || caracteristicas.length < 10 || caracteristicas.length > 2000) {
        return paginaRespuesta(res, 400, 'Datos incompletos', 'El nombre debe tener entre 3 y 100 caracteres y las características al menos 10.', volver);
    }

    try {
        db.prepare('INSERT INTO pedidos (usuario_id, seccion, tipo, nombre, caracteristicas) VALUES (?, ?, ?, ?, ?)')
            .run(req.usuario.id, seccion, tipo, nombre, caracteristicas);
        paginaRespuesta(res, 201, '¡Pedido recibido!', `Gracias, ${req.usuario.nombre}. Revisaremos tu pedido "${nombre}" y te contactaremos pronto.`, volver);
    } catch (error) {
        console.error(error);
        paginaRespuesta(res, 500, 'Error en el servidor', 'No pudimos registrar tu pedido. Inténtalo más tarde.', volver);
    }
});

// --- ASISTENTE VIRTUAL (WhatsApp, Messenger e Instagram con IA) ---
require('./chatbot').montar(app, db, { requiereAdmin });

// Iniciar el servidor
const servidor = app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
    console.log(`Desde otros dispositivos de la red usa la IP de este equipo, p. ej. http://192.168.18.10:${PORT}`);
    if (!transporte) {
        console.log('Correo sin configurar: los enlaces de "Olvidé mi contraseña" se mostrarán aquí (ver .env.example).');
    }
    if (transporte && !process.env.BASE_URL) {
        console.warn('Falta BASE_URL en .env: los enlaces de recuperación apuntarán a localhost.');
    }
});

// Si el puerto ya está en uso, se explica en lugar de mostrar un error técnico
servidor.on('error', (error) => {
    if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        console.error(`El puerto ${PORT} ya está en uso por otro programa (por ejemplo, la vista previa de VS Code o un servicio de Windows).`);
        console.error('Ciérralo o elige otro puerto en .env, por ejemplo: PORT=5051');
        process.exit(1);
    }
    throw error;
});
