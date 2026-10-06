// --- AGENDA DEL ASISTENTE: horarios libres, citas y Google Calendar ---
// Las citas se guardan siempre en la base de datos (tabla "citas").
// Si Google Calendar está configurado (.env), además se consultan los eventos ocupados
// del calendario del consultorio y cada cita se crea allí como evento.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { JWT } = require('google-auth-library');

const CONFIG = require('./config.json');
const ZONA = 'America/Guayaquil';
const DESFASE = '-05:00'; // Ecuador no cambia de horario en el año
const MS_HORA = 60 * 60 * 1000;

let db = null;
let google = null; // { cliente, calendario }

function iniciar(baseDeDatos) {
    db = baseDeDatos;
    db.exec(`
      CREATE TABLE IF NOT EXISTS citas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversacion TEXT NOT NULL,
        nombre TEXT NOT NULL,
        edad INTEGER,
        celular TEXT,
        tipo_consulta TEXT NOT NULL,
        motivo_area TEXT,
        motivo_detalle TEXT,
        modalidad TEXT NOT NULL,
        inicio TEXT NOT NULL,
        fin TEXT NOT NULL,
        valor REAL NOT NULL,
        abono REAL NOT NULL,
        estado TEXT NOT NULL DEFAULT 'abono_pendiente',
        evento_google TEXT,
        creada TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    if (!db.prepare('PRAGMA table_info(citas)').all().some((c) => c.name === 'token')) {
        db.exec('ALTER TABLE citas ADD COLUMN token TEXT');
    }

    const calendario = process.env.GOOGLE_CALENDAR_ID;
    const credencial = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    if (calendario && credencial) {
        try {
            const datos = JSON.parse(fs.readFileSync(path.resolve(credencial), 'utf8'));
            google = {
                calendario,
                cliente: new JWT({
                    email: datos.client_email,
                    key: datos.private_key,
                    scopes: ['https://www.googleapis.com/auth/calendar']
                })
            };
        } catch (error) {
            console.error('[Agenda] No se pudo leer la cuenta de servicio de Google:', error.message);
        }
    }
    return Boolean(google);
}

// --- Fechas en hora de Ecuador ---
function ahoraLocal() {
    const d = new Date(Date.now() - 5 * MS_HORA);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}
const aIso = (local) => `${local}:00${DESFASE}`;
const aMs = (local) => Date.parse(aIso(local));
function sumarMinutos(local, minutos) {
    return new Date(aMs(local) + minutos * 60000 - 5 * MS_HORA).toISOString().slice(0, 16);
}
function diaSemana(fecha) {
    const [a, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}
function sumarDias(fecha, n) {
    const [a, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLegible(local) {
    const [fecha, hora] = local.split('T');
    const [a, m, d] = fecha.split('-').map(Number);
    return { fecha: `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]} de ${a}`, hora };
}

// --- Reservas sin abono: después de "horas_para_abono" se liberan solas ---
function vencerReservas() {
    const horas = CONFIG.horas_para_abono || 24;
    const vencidas = db.prepare(`SELECT * FROM citas WHERE estado = 'abono_pendiente' AND creada < datetime('now', ?)`).all(`-${horas} hours`);
    for (const cita of vencidas) {
        db.prepare("UPDATE citas SET estado = 'vencida' WHERE id = ?").run(cita.id);
        actualizarEvento(cita, null);
    }
    return vencidas;
}

const ACTIVAS = "estado NOT IN ('cancelada', 'vencida')";

// --- Horarios ocupados: citas guardadas + eventos del Google Calendar ---
async function ocupados(desdeMs, hastaMs) {
    vencerReservas();
    const lista = db.prepare(`SELECT inicio, fin FROM citas WHERE ${ACTIVAS}`).all()
        .map((c) => [aMs(c.inicio), aMs(c.fin)]);
    if (google) {
        const { data } = await google.cliente.request({
            url: 'https://www.googleapis.com/calendar/v3/freeBusy',
            method: 'POST',
            data: {
                timeMin: new Date(desdeMs).toISOString(),
                timeMax: new Date(hastaMs).toISOString(),
                timeZone: ZONA,
                items: [{ id: google.calendario }]
            }
        });
        const cal = data.calendars[google.calendario] || {};
        if (cal.errors) throw new Error('Google Calendar: ' + JSON.stringify(cal.errors));
        (cal.busy || []).forEach((b) => lista.push([Date.parse(b.start), Date.parse(b.end)]));
    }
    return lista;
}

const seCruza = (a, b, lista) => lista.some(([x, y]) => a < y && x < b);

// Horarios libres desde una fecha, en la franja pedida (máximo 4 por día, 12 en total)
async function disponibilidad({ fecha_desde, dias, franja }) {
    const h = CONFIG.horario;
    const ahora = ahoraLocal();
    const limite = Date.now() + h.anticipacion_minima_horas * MS_HORA;
    const hoy = ahora.slice(0, 10);
    let inicio = /^\d{4}-\d{2}-\d{2}$/.test(fecha_desde) && fecha_desde > hoy ? fecha_desde : hoy;
    const ultimo = sumarDias(hoy, h.dias_maximos_adelante);
    const cantidad = Math.min(Math.max(dias || 7, 1), 14);

    const candidatos = [];
    for (let i = 0; i < cantidad && inicio <= ultimo; i++, inicio = sumarDias(inicio, 1)) {
        const dia = h.dias[String(diaSemana(inicio))];
        if (!dia) continue;
        for (const nombre of ['manana', 'tarde']) {
            if (!dia[nombre] || (franja !== 'cualquiera' && franja !== nombre)) continue;
            const [desde, hasta] = dia[nombre];
            for (let s = `${inicio}T${desde}`; sumarMinutos(s, h.duracion_minutos) <= `${inicio}T${hasta}`; s = sumarMinutos(s, h.duracion_minutos)) {
                if (aMs(s) >= limite) candidatos.push(s);
            }
        }
    }
    if (!candidatos.length) return { horarios: [], nota: 'No hay horarios de atención en ese rango.' };

    const lista = await ocupados(aMs(candidatos[0]), aMs(candidatos[candidatos.length - 1]) + h.duracion_minutos * 60000);
    const porDia = {};
    const libres = [];
    for (const s of candidatos) {
        const fin = aMs(s) + h.duracion_minutos * 60000;
        const dia = s.slice(0, 10);
        if (seCruza(aMs(s), fin, lista) || (porDia[dia] || 0) >= 4) continue;
        porDia[dia] = (porDia[dia] || 0) + 1;
        libres.push({ inicio: s, ...fechaLegible(s) });
        if (libres.length >= 12) break;
    }
    return { horarios: libres, duracion_minutos: h.duracion_minutos };
}

async function horarioLibre(inicio) {
    const h = CONFIG.horario;
    const fin = sumarMinutos(inicio, h.duracion_minutos);
    const dia = h.dias[String(diaSemana(inicio.slice(0, 10)))] || {};
    const enHorario = Object.values(dia).some(([a, b]) => inicio.slice(11) >= a && fin.slice(11) <= b && fin.slice(0, 10) === inicio.slice(0, 10));
    const aTiempo = aMs(inicio) >= Date.now() + h.anticipacion_minima_horas * MS_HORA
        && inicio.slice(0, 10) <= sumarDias(ahoraLocal().slice(0, 10), h.dias_maximos_adelante);
    return enHorario && aTiempo && !seCruza(aMs(inicio), aMs(fin), await ocupados(aMs(inicio), aMs(fin)));
}

function datosDePago() {
    const p = CONFIG.pago;
    return {
        banco: p.banco || null,
        tipo_cuenta: p.tipo_cuenta || null,
        numero_cuenta: p.numero_cuenta,
        cedula: p.cedula,
        titular: p.titular,
        celular: p.celular,
        correo: p.correo
    };
}

function descripcionEvento(c) {
    return [
        `Paciente: ${c.nombre} (${c.edad} años)`,
        `Celular / canal: ${c.celular || '-'} · ${c.conversacion}`,
        `Consulta: ${CONFIG.valores[c.tipo_consulta].nombre} · ${c.modalidad}`,
        `Motivo: ${c.motivo_area}${c.motivo_detalle ? ' — ' + c.motivo_detalle : ''}`,
        `Valor: $${c.valor.toFixed(2)} · Abono 50 %: $${c.abono.toFixed(2)} · Estado: ${ESTADOS[c.estado] || c.estado}`,
        '',
        'Agendada automáticamente por el asistente de WhatsApp de Salus Mens.'
    ].join('\n');
}

const ESTADOS = {
    abono_pendiente: 'reservada, abono pendiente',
    comprobante_recibido: 'comprobante por verificar',
    confirmada: 'confirmada (abono verificado)',
    cancelada: 'cancelada',
    vencida: 'vencida (no se recibió el abono)'
};
const TITULOS = {
    abono_pendiente: 'RESERVA · ABONO PENDIENTE',
    comprobante_recibido: 'RESERVA · COMPROBANTE POR VERIFICAR'
};
const COLORES = { abono_pendiente: '5', comprobante_recibido: '6', confirmada: '10' }; // amarillo, naranja, verde
const tituloEvento = (c) => `Consulta: ${c.nombre}` + (TITULOS[c.estado] ? ` · ${TITULOS[c.estado]}` : '');
const cambiosEvento = (c) => ({ summary: tituloEvento(c), description: descripcionEvento(c), colorId: COLORES[c.estado] });

async function agendar(conversacion, datos) {
    const h = CONFIG.horario;
    const valor = CONFIG.valores[datos.tipo_consulta];
    if (!valor) return { error: 'Tipo de consulta no válido.' };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datos.inicio)) return { error: 'Formato de horario no válido.' };

    // Se vuelve a comprobar que el horario esté dentro de la atención y siga libre
    if (!(await horarioLibre(datos.inicio))) {
        return { error: 'Ese horario ya no está disponible. Consulta la disponibilidad otra vez.' };
    }

    const cita = {
        conversacion,
        nombre: datos.nombre.trim(),
        edad: datos.edad,
        celular: datos.celular,
        tipo_consulta: datos.tipo_consulta,
        motivo_area: datos.motivo_area,
        motivo_detalle: datos.motivo_detalle,
        modalidad: datos.modalidad === 'en_linea' ? 'en línea' : 'presencial',
        inicio: datos.inicio,
        fin: sumarMinutos(datos.inicio, h.duracion_minutos),
        valor: valor.valor,
        abono: Math.round(valor.valor * CONFIG.abono_porcentaje) / 100,
        estado: 'abono_pendiente',
        token: crypto.randomBytes(16).toString('hex')
    };
    const { lastInsertRowid } = db.prepare(`INSERT INTO citas
        (conversacion, nombre, edad, celular, tipo_consulta, motivo_area, motivo_detalle, modalidad, inicio, fin, valor, abono, estado, token)
        VALUES (@conversacion, @nombre, @edad, @celular, @tipo_consulta, @motivo_area, @motivo_detalle, @modalidad, @inicio, @fin, @valor, @abono, @estado, @token)`)
        .run(cita);
    cita.id = Number(lastInsertRowid);

    let enCalendario = false;
    if (google) {
        try {
            const { data } = await google.cliente.request({
                url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(google.calendario)}/events`,
                method: 'POST',
                data: {
                    ...cambiosEvento(cita),
                    location: cita.modalidad === 'presencial' ? CONFIG.direccion : 'En línea',
                    start: { dateTime: aIso(cita.inicio), timeZone: ZONA },
                    end: { dateTime: aIso(cita.fin), timeZone: ZONA }
                }
            });
            db.prepare('UPDATE citas SET evento_google = ? WHERE id = ?').run(data.id, cita.id);
            enCalendario = true;
        } catch (error) {
            console.error('[Agenda] No se pudo crear el evento en Google Calendar:', error.message);
        }
    }

    const legible = fechaLegible(cita.inicio);
    return {
        cita_id: cita.id,
        estado: 'Horario reservado. La cita se confirma cuando el centro verifique el abono con el banco.',
        horas_para_enviar_abono: CONFIG.horas_para_abono || 24,
        fecha: legible.fecha,
        hora: legible.hora,
        modalidad: cita.modalidad,
        paciente: cita.nombre,
        motivo: `${cita.motivo_area}${cita.motivo_detalle ? ' — ' + cita.motivo_detalle : ''}`,
        consulta: CONFIG.valores[cita.tipo_consulta].nombre,
        valor: cita.valor,
        abono: cita.abono,
        por_cancelar: cita.valor - cita.abono,
        datos_de_pago: datosDePago(),
        registrada_en_google_calendar: enCalendario,
        cita
    };
}

function citaDe(conversacion, citaId) {
    return citaId
        ? db.prepare(`SELECT * FROM citas WHERE id = ? AND conversacion = ? AND ${ACTIVAS}`).get(citaId, conversacion)
        : db.prepare(`SELECT * FROM citas WHERE conversacion = ? AND ${ACTIVAS} ORDER BY id DESC`).get(conversacion);
}

async function actualizarEvento(cita, cambios) {
    if (!google || !cita.evento_google) return;
    try {
        await google.cliente.request({
            url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(google.calendario)}/events/${encodeURIComponent(cita.evento_google)}`,
            method: cambios ? 'PATCH' : 'DELETE',
            data: cambios
        });
    } catch (error) {
        console.error('[Agenda] No se pudo actualizar Google Calendar:', error.message);
    }
}

async function cambiarEstado(cita, estado) {
    db.prepare('UPDATE citas SET estado = ? WHERE id = ?').run(estado, cita.id);
    cita.estado = estado;
    await actualizarEvento(cita, estado === 'cancelada' ? null : cambiosEvento(cita));
    return cita;
}

async function registrarComprobante(conversacion, citaId) {
    const cita = citaDe(conversacion, citaId);
    if (!cita) return { error: 'No encontré una reserva activa de este paciente.' };
    if (cita.estado === 'confirmada') return { cita_id: cita.id, estado: 'Esta cita ya estaba confirmada.' };
    await cambiarEstado(cita, 'comprobante_recibido');
    return { cita_id: cita.id, estado: 'Comprobante recibido. El centro lo verificará con el banco y enviará la confirmación de la cita.', cita };
}

// --- Acciones del psicólogo desde el panel de citas ---
const citaPorId = (id) => db.prepare('SELECT * FROM citas WHERE id = ?').get(id);
const citaPorToken = (token) => (/^[a-f0-9]{32}$/.test(token) ? db.prepare(`SELECT * FROM citas WHERE token = ? AND estado = 'confirmada'`).get(token) : null);

async function confirmarPago(id) {
    const cita = citaPorId(id);
    if (!cita || !['abono_pendiente', 'comprobante_recibido'].includes(cita.estado)) return { error: 'La cita no está pendiente de verificación.' };
    return { cita: await cambiarEstado(cita, 'confirmada') };
}

async function pagoNoValido(id) {
    const cita = citaPorId(id);
    if (!cita || cita.estado !== 'comprobante_recibido') return { error: 'La cita no tiene un comprobante por verificar.' };
    db.prepare("UPDATE citas SET creada = CURRENT_TIMESTAMP WHERE id = ?").run(cita.id); // nuevo plazo para el abono
    return { cita: await cambiarEstado(cita, 'abono_pendiente') };
}

async function cancelarPorId(id) {
    const cita = citaPorId(id);
    if (!cita || ['cancelada', 'vencida'].includes(cita.estado)) return { error: 'La cita ya no está activa.' };
    return { cita: await cambiarEstado(cita, 'cancelada') };
}

function listarParaPanel() {
    vencerReservas();
    return db.prepare(`SELECT * FROM citas WHERE ${ACTIVAS} AND fin >= ? ORDER BY
        CASE estado WHEN 'comprobante_recibido' THEN 0 WHEN 'abono_pendiente' THEN 1 ELSE 2 END, inicio`).all(ahoraLocal())
        .map((c) => ({ ...c, ...fechaLegible(c.inicio), estado_texto: ESTADOS[c.estado], consulta: CONFIG.valores[c.tipo_consulta].nombre }));
}

async function cancelar(conversacion, citaId) {
    const cita = citaDe(conversacion, citaId);
    if (!cita) return { error: 'No encontré una cita activa de este paciente.' };
    await cambiarEstado(cita, 'cancelada');
    return { cita_id: cita.id, cancelada: true, ...fechaLegible(cita.inicio), cita };
}

function citasActivas(conversacion) {
    vencerReservas();
    return db.prepare(`SELECT id, inicio, modalidad, estado FROM citas WHERE conversacion = ? AND ${ACTIVAS} AND inicio >= ? ORDER BY inicio`)
        .all(conversacion, ahoraLocal())
        .map((c) => ({ cita_id: c.id, ...fechaLegible(c.inicio), modalidad: c.modalidad, estado: ESTADOS[c.estado] }));
}

module.exports = {
    iniciar, disponibilidad, agendar, registrarComprobante, cancelar, citasActivas, ahoraLocal, fechaLegible, datosDePago,
    confirmarPago, pagoNoValido, cancelarPorId, listarParaPanel, citaPorId, citaPorToken, vencerReservas, CONFIG
};
