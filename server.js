const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const db = new Database('usuarios.db');

// Configuración para leer formularios y JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir los archivos estáticos de tu HTML/CSS
app.use(express.static(path.join(__dirname, 'public')));

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
`);

// --- RUTA 1: REGISTRO DE USUARIOS ---
app.post('/api/registro', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        // Encriptar contraseña por seguridad
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const stmt = db.prepare('INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)');
        stmt.run(nombre, email, hashedPassword);
        
        res.send('<h1>¡Registro exitoso! <a href="/index.html">Volver</a></h1>');
    } catch (error) {
        res.status(400).send('El correo ya está registrado o hubo un error.');
    }
});

// --- RUTA 2: INICIO DE SESIÓN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const stmt = db.prepare('SELECT * FROM usuarios WHERE email = ?');
        const usuario = stmt.get(email);

        if (!usuario) {
            return res.status(400).send('Usuario no encontrado.');
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(400).send('Contraseña incorrecta.');
        }

        res.send(`<h1>¡Bienvenido/a, ${usuario.nombre}! Has iniciado sesión.</h1>`);
    } catch (error) {
        res.status(500).send('Error en el servidor.');
    }
});

// --- RUTA 3: SUSCRIPCIONES (BOLETÍN/NEWSLETTER) ---
app.post('/api/suscribirse', (req, res) => {
    const { email } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO suscripciones (email) VALUES (?)');
        stmt.run(email);
        res.send('<h1>¡Gracias por suscribirte!</h1>');
    } catch (error) {
        res.status(400).send('Este correo ya está suscrito.');
    }
});

// Iniciar el servidor
app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});
