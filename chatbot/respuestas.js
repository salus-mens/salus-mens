// --- RESPUESTAS AUTOMÁTICAS SIN IA (menú por números) ---
// Funciona sin costo y sin conexión a la IA. Se usa cuando:
//   · no hay clave de Claude en .env, o CHATBOT_MODO=menu, o
//   · la IA falla (por ejemplo, la cuenta se quedó sin saldo).
// Sigue el mensaje de bienvenida del centro (opciones 1 a 4) y permite agendar paso a paso.
const agenda = require('./agenda');
const notificar = require('./notificar');

const CONFIG = agenda.CONFIG;
const VIGENCIA_PASO_MS = 2 * 60 * 60 * 1000; // un agendamiento a medias se olvida tras 2 h sin respuesta
const SERVICIOS = [
    ['Psicología Clínica', 'evaluación, diagnóstico y tratamiento de ansiedad, depresión, duelo, autoestima y otros trastornos, con terapia cognitivo-conductual.'],
    ['Psicología Infantil y Psicorrehabilitación', 'TEA (evaluación ADOS-2), TDAH, problemas de conducta y regulación emocional, retraso del lenguaje y estimulación cognitiva.'],
    ['Psicopedagogía', 'dificultades de aprendizaje (lectura, escritura, cálculo), bajo rendimiento y hábitos de estudio.'],
    ['Terapia Ocupacional', 'integración sensorial, motricidad fina y gruesa, grafomotricidad y autonomía en la vida diaria.']
];
const CRISIS = /suicid|quitarme la vida|matarme|me quiero morir|quiero morir|hacerme da[ñn]o|lastimarme|autolesi|no quiero vivir|cortarme/i;

let db = null;

function iniciar(baseDeDatos) {
    db = baseDeDatos;
    db.exec(`
      CREATE TABLE IF NOT EXISTS chatbot_menu (
        conversacion TEXT PRIMARY KEY,
        paso TEXT,
        datos TEXT NOT NULL DEFAULT '{}',
        actualizado INTEGER NOT NULL
      );
    `);
}

// --- Estado de cada conversación ---
function estado(conversacion) {
    const fila = db.prepare('SELECT paso, datos, actualizado FROM chatbot_menu WHERE conversacion = ?').get(conversacion);
    if (!fila || Date.now() - fila.actualizado > VIGENCIA_PASO_MS) return { paso: null, datos: {}, nuevo: !fila || Date.now() - fila.actualizado > 24 * VIGENCIA_PASO_MS };
    return { paso: fila.paso, datos: JSON.parse(fila.datos), nuevo: false };
}
function guardar(conversacion, paso, datos = {}) {
    db.prepare(`INSERT INTO chatbot_menu (conversacion, paso, datos, actualizado) VALUES (?, ?, ?, ?)
                ON CONFLICT(conversacion) DO UPDATE SET paso = excluded.paso, datos = excluded.datos, actualizado = excluded.actualizado`)
        .run(conversacion, paso, JSON.stringify(datos), Date.now());
}

// --- Textos (formato de WhatsApp: *negrita*, _cursiva_) ---
function saludo() {
    const hora = Number(agenda.ahoraLocal().slice(11, 13));
    return hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

const BIENVENIDA = () => `${saludo()}, saluda Centro Psicológico *Salus Mens*

Que tenga una *excelente* semana, es un *placer* atenderle. El motivo del presente es para *preguntar* cuál de las siguientes opciones corresponde a su *requerimiento*:

1. Información sobre cartera de servicios.
2. Información sobre precios y métodos de pago.
3. Información para agendar una consulta.
4. Otros... (_especifique_)

_Responda con el número de la opción._

De antemano agradecemos su atención y *confianza*, su *_salud mental_* es nuestra prioridad. 🌻`;

const VOLVER = '\n\n_Escriba *0* para volver al menú._';

const pesos = (n) => `$${Number(n).toFixed(2)}`;

const textoServicios = () => `*Cartera de servicios* · enfoque cognitivo-conductual, para niños/as, adolescentes y adultos:

${SERVICIOS.map(([nombre, detalle], i) => `${i + 1}. *${nombre}:* ${detalle}`).join('\n')}

Modalidad presencial y en línea. Más información: ${CONFIG.web}

Para agendar una consulta escriba *3*.${VOLVER}`;

function textoPago() {
    const p = CONFIG.pago;
    const lineas = [
        p.banco && `*Banco:* ${p.banco}`,
        p.tipo_cuenta && `*Tipo de cuenta:* ${p.tipo_cuenta}`,
        `*Número de cuenta:* ${p.numero_cuenta}`,
        `*Número de cédula:* ${p.cedula}`,
        `*Nombres y apellidos:* ${p.titular}`,
        `*Celular:* ${p.celular}`,
        `*Correo:* ${p.correo}`
    ].filter(Boolean);
    return `*Cancelación electrónica*\n${lineas.join('\n')}\n\n_Nota._ Enviar el comprobante de pago vía WhatsApp o correo electrónico.`;
}

const textoPrecios = () => {
    const v = CONFIG.valores;
    return `*Valores a cancelar:*
1. *${v.infantil_adolescente.nombre}:* ${pesos(v.infantil_adolescente.valor)} (dólares americanos)
2. *${v.adulto.nombre}:* ${pesos(v.adulto.valor)} (dólares americanos)
3. *${v.discapacidad.nombre}:* ${pesos(v.discapacidad.valor)} (dólares americanos)

Para asegurar su *asistencia* se requiere el abono del *${CONFIG.abono_porcentaje} %* del valor de la consulta (adjuntar el comprobante de pago).

${textoPago()}

*Factura electrónica SRI* (en caso de requerirla), envíe:
1. Nombres y apellidos
2. Número de celular
3. Correo electrónico

Para agendar una consulta escriba *3*.${VOLVER}`;
};

const textoAreas = () => CONFIG.areas_motivo.map((a, i) => `${i + 1}. ${a}`).join('\n');

const CIERRE = 'Es un placer atenderle, *gracias por su confianza*, su *Salud Mental* es nuestra prioridad, que tenga una excelente semana. 🌻';

function textoConfirmacion(r) {
    return `${saludo()}, saluda Centro Psicológico *Salus Mens*.
Que tenga una *excelente semana*, el motivo del presente es para *notificarle* que su *consulta* se *agendó* para:

*Fecha:* ${r.fecha}
*Hora:* ${r.hora}
*Modalidad:* ${r.modalidad[0].toUpperCase() + r.modalidad.slice(1)}
*Paciente:* ${r.paciente}
*Motivo:* ${r.motivo}
*Abono:* ${pesos(r.abono)} dólares americanos
*Por cancelar:* ${pesos(r.por_cancelar)} dólares americanos

_Gracias por su confianza_, cualquier inquietud nos informa, su *salud mental* Ψ es nuestra *prioridad*, un excelente día.`;
}

// --- Lógica ---
const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const esNumero = (t, n) => new RegExp(`^\\s*${n}\\s*[.)-]?\\s*$`).test(t);

async function ofrecerHorarios(conversacion, datos, desde) {
    const { horarios } = await agenda.disponibilidad({ fecha_desde: desde, dias: 7, franja: datos.franja });
    const opciones = horarios.slice(0, 6);
    if (!opciones.length) {
        guardar(conversacion, 'franja', datos);
        return 'No encontramos horarios libres en esos días. Escriba *1* para mañana, *2* para tarde o *0* para volver al menú; también puede escribir *4* para que el psicólogo le contacte.';
    }
    datos.opciones = opciones.map((o) => o.inicio);
    datos.siguiente = opciones[opciones.length - 1].inicio.slice(0, 10);
    guardar(conversacion, 'horario', datos);
    return `Estos son los horarios disponibles:\n\n${opciones.map((o, i) => `${i + 1}. ${o.fecha[0].toUpperCase() + o.fecha.slice(1)} · ${o.hora}`).join('\n')}\n\nResponda con el *número* del horario, o *9* para ver más fechas.${VOLVER}`;
}

async function pasoAgendar(conversacion, paso, datos, texto, contexto) {
    const t = texto.trim();
    switch (paso) {
        case 'nombre':
            if (t.length < 5 || !/[a-záéíóúñ]{2,}\s+[a-záéíóúñ]{2,}/i.test(t)) return 'Por favor escriba los *nombres y apellidos* del paciente.';
            datos.nombre = t.replace(/\s+/g, ' ');
            guardar(conversacion, 'edad', datos);
            return `Gracias. ¿Cuál es la *edad cronológica* de ${datos.nombre.split(' ')[0]}? (solo el número de años)`;
        case 'edad': {
            const edad = Number((t.match(/\d{1,3}/) || [])[0]);
            if (!edad || edad > 110) return 'Escriba la edad en años, solo el número (por ejemplo: *8*).';
            datos.edad = edad;
            guardar(conversacion, 'motivo', datos);
            return `*Motivo de consulta:* seleccione una opción:\n\n${textoAreas()}`;
        }
        case 'motivo': {
            const n = Number(t);
            if (!(n >= 1 && n <= CONFIG.areas_motivo.length)) return `Responda con un número del 1 al ${CONFIG.areas_motivo.length}:\n\n${textoAreas()}`;
            datos.motivo_area = CONFIG.areas_motivo[n - 1];
            guardar(conversacion, 'detalle', datos);
            return 'Por favor *especifique* brevemente el motivo (por ejemplo: "le cuesta pronunciar algunas palabras").';
        }
        case 'detalle':
            datos.motivo_detalle = t.slice(0, 300);
            guardar(conversacion, 'franja', datos);
            return '*Horario de preferencia:*\n\n1. Mañana\n2. Tarde';
        case 'franja':
            if (!esNumero(t, 1) && !esNumero(t, 2) && !/manana|tarde/.test(normalizar(t))) return 'Responda *1* para mañana o *2* para tarde.';
            datos.franja = esNumero(t, 1) || /manana/.test(normalizar(t)) ? 'manana' : 'tarde';
            return ofrecerHorarios(conversacion, datos, agenda.ahoraLocal().slice(0, 10));
        case 'horario': {
            if (esNumero(t, 9)) {
                const [a, m, d] = datos.siguiente.split('-').map(Number);
                return ofrecerHorarios(conversacion, datos, new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10));
            }
            const n = Number(t);
            if (!(n >= 1 && n <= datos.opciones.length)) return `Responda con el número del horario (1 a ${datos.opciones.length}) o *9* para ver más fechas.`;
            datos.inicio = datos.opciones[n - 1];
            guardar(conversacion, 'modalidad', datos);
            return '*Modalidad:*\n\n1. Presencial\n2. En línea';
        }
        case 'modalidad': {
            if (!esNumero(t, 1) && !esNumero(t, 2)) return 'Responda *1* para presencial o *2* para en línea.';
            const tipo = datos.motivo_area === CONFIG.areas_motivo[CONFIG.areas_motivo.length - 1] ? 'discapacidad'
                : datos.edad < 18 ? 'infantil_adolescente' : 'adulto';
            const r = await agenda.agendar(conversacion, {
                nombre: datos.nombre, edad: datos.edad, tipo_consulta: tipo,
                motivo_area: datos.motivo_area, motivo_detalle: datos.motivo_detalle,
                modalidad: esNumero(t, 2) ? 'en_linea' : 'presencial', inicio: datos.inicio,
                celular: contexto.canal === 'whatsapp' ? contexto.usuario : ''
            });
            if (r.error) {
                delete datos.inicio;
                const lista = await ofrecerHorarios(conversacion, datos, agenda.ahoraLocal().slice(0, 10));
                return `Lo sentimos, ese horario acaba de ocuparse. ${lista}`;
            }
            notificar.nuevaCita(r.cita, contexto);
            guardar(conversacion, null, {});
            return [textoConfirmacion(r), `Para *asegurar su asistencia*, por favor realice el abono de *${pesos(r.abono)}* y envíe el comprobante por este chat.\n\n${textoPago()}`];
        }
        default:
            return null;
    }
}

// Devuelve un texto o una lista de textos (se envían como mensajes separados)
async function responder({ canal, usuario, nombreContacto, texto }) {
    const conversacion = `${canal}:${usuario}`;
    const contexto = { conversacion, canal, usuario, nombreContacto };
    const t = normalizar(texto || '');
    const { paso, datos, nuevo } = estado(conversacion);

    // 1. Seguridad: ante una posible crisis, se responde de inmediato y se avisa como urgente
    if (CRISIS.test(t)) {
        notificar.derivacion({ motivo: `Posible crisis. Mensaje: "${texto.slice(0, 300)}"`, urgente: true }, contexto);
        guardar(conversacion, null, {});
        return 'Lamentamos mucho que esté pasando por esto y gracias por escribirnos. *Su vida es importante.* Por favor, llame ahora mismo al *ECU 911* o acuda a la emergencia más cercana, y no se quede solo/a: busque a alguien de confianza. El psicólogo ya fue avisado y se comunicará con usted lo antes posible.';
    }

    // 2. Imagen o documento: si hay una cita pendiente, es el comprobante de pago
    if (/^\[el paciente envio (una imagen|un documento)/.test(t)) {
        const r = await agenda.registrarComprobante(conversacion, 0);
        if (r.cita) {
            notificar.comprobante(r.cita, contexto);
            return `Recibimos su *comprobante*, muchas gracias. El centro lo verificará y le confirmará. ${CIERRE}`;
        }
    }
    if (/^\[el paciente envio un audio/.test(t)) return 'Por el momento no podemos escuchar audios. Por favor, *escriba* su mensaje. 🙏';

    // 3. Volver al menú
    if (esNumero(t, 0) || /^(menu|inicio|volver)$/.test(t)) {
        guardar(conversacion, null, {});
        return BIENVENIDA();
    }

    // 4. Si está agendando, se continúa con el paso pendiente
    if (paso === 'otros') {
        notificar.derivacion({ motivo: `Consulta del paciente: "${texto.slice(0, 500)}"`, urgente: false }, contexto);
        guardar(conversacion, null, {});
        return `Gracias, hemos recibido su mensaje. El psicólogo se comunicará con usted personalmente a la brevedad. ${CIERRE}`;
    }
    if (paso) return pasoAgendar(conversacion, paso, datos, texto, contexto);

    // 5. Opciones del menú y palabras frecuentes
    if (esNumero(t, 1) || /servicio|cartera|que hacen|terapia|tratamiento/.test(t)) return textoServicios();
    if (esNumero(t, 2) || /precio|costo|cuanto|valor|pago|pagar|cuenta|transferencia|factura/.test(t)) return textoPrecios();
    if (esNumero(t, 3) || /agend|citas?|turno|consulta|reserv/.test(t)) {
        guardar(conversacion, 'nombre', {});
        return `Con gusto. Para brindarle un servicio de *calidad* se requieren los siguientes *datos* para agendar su *consulta*.

Primero, escriba los *nombres y apellidos* del paciente.${VOLVER}`;
    }
    if (esNumero(t, 4)) {
        guardar(conversacion, 'otros', {});
        return 'Por favor, *especifique* su requerimiento en un solo mensaje y lo haremos llegar al psicólogo.';
    }
    if (/donde|ubicacion|direccion|llegar|mapa/.test(t)) return `📍 Nos encontramos en *${CONFIG.direccion}*.\nUbicación y mapa: ${CONFIG.web}/conocenos.html${VOLVER}`;
    if (/(horario|horarios|atienden|abren|atencion)/.test(t)) return `Atendemos con *cita previa* de lunes a viernes en la mañana y en la tarde, y los sábados en la mañana. Para ver los horarios disponibles escriba *3*.${VOLVER}`;
    if (/(gracias|muy amable|excelente|perfecto|ok|listo)/.test(t) && !nuevo) return CIERRE;
    if (/(humano|psicologo|persona|hablar con)/.test(t)) {
        guardar(conversacion, 'otros', {});
        return 'Con gusto. Escriba en un solo mensaje lo que necesita y el psicólogo se comunicará con usted personalmente.';
    }

    // 6. Cualquier otro mensaje: bienvenida con el menú
    return BIENVENIDA();
}

// Messenger e Instagram no muestran negritas: se quitan los asteriscos y guiones bajos
function adaptar(texto, canal) {
    return canal === 'whatsapp' || canal === 'prueba' ? texto : texto.replace(/[*_]/g, '');
}

module.exports = { iniciar, responder, adaptar, BIENVENIDA };
