// --- CONFIRMACIÓN DE LA CITA (después de verificar el abono) ---
// Texto del mensaje de agendamiento del centro y una imagen PNG descargable con los mismos datos.
const path = require('path');
const sharp = require('sharp');
const agenda = require('./agenda');

const CONFIG = agenda.CONFIG;
const LOGO = path.join(__dirname, '..', 'public', 'Images', 'Logo.png');
const pesos = (n) => `$${Number(n).toFixed(2)}`;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function saludo() {
    const hora = Number(agenda.ahoraLocal().slice(11, 13));
    return hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function datos(cita) {
    const { fecha, hora } = agenda.fechaLegible(cita.inicio);
    return {
        fecha: mayuscula(fecha),
        hora,
        modalidad: mayuscula(cita.modalidad),
        paciente: cita.nombre,
        motivo: cita.motivo_area + (cita.motivo_detalle ? ` — ${cita.motivo_detalle}` : ''),
        abono: cita.abono,
        por_cancelar: cita.valor - cita.abono
    };
}

// Mensaje de agendamiento (formato de WhatsApp)
function texto(cita) {
    const d = datos(cita);
    return `${saludo()}, saluda Centro Psicológico *Salus Mens*.
Que tenga una *excelente semana*, el motivo del presente es para *notificarle* que su *abono fue verificado* y su *consulta* se *agendó* para:

*Fecha:* ${d.fecha}
*Hora:* ${d.hora}
*Modalidad:* ${d.modalidad}
*Paciente:* ${d.paciente}
*Motivo:* ${d.motivo}
*Abono:* ${pesos(d.abono)} dólares americanos ✅
*Por cancelar:* ${pesos(d.por_cancelar)} dólares americanos

_Gracias por su confianza_, cualquier inquietud nos informa, su *salud mental* Ψ es nuestra *prioridad*, un excelente día.`;
}

// --- Imagen de la cita (1080 x 1350) ---
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Corta un texto largo en líneas de "ancho" caracteres como máximo
function lineas(t, ancho, maximo) {
    const palabras = String(t).split(/\s+/);
    const res = [''];
    for (const p of palabras) {
        if ((res[res.length - 1] + ' ' + p).trim().length > ancho) res.push(p);
        else res[res.length - 1] = (res[res.length - 1] + ' ' + p).trim();
    }
    if (res.length > maximo) { res.length = maximo; res[maximo - 1] = res[maximo - 1].replace(/.{0,3}$/, '…'); }
    return res;
}

async function imagen(cita) {
    const d = datos(cita);
    // Filas: una o dos columnas [etiqueta, líneas]
    const filas = [
        [['FECHA', lineas(d.fecha, 22, 2)], ['HORA', [d.hora]]],
        [['PACIENTE', lineas(d.paciente, 40, 2)]],
        [['MOTIVO', lineas(d.motivo, 40, 3)]],
        [['MODALIDAD', [d.modalidad]], ['ABONO', [`${pesos(d.abono)} ✓ verificado`]]],
        [['POR CANCELAR EL DÍA DE LA CONSULTA', [`${pesos(d.por_cancelar)} dólares americanos`]]]
    ];
    let y = 460;
    const bloques = filas.map((columnas) => {
        let alto = 0;
        const svg = columnas.map(([etiqueta, valor], c) => {
            const x = 120 + c * 470;
            alto = Math.max(alto, 40 + valor.length * 44);
            return `<text x="${x}" y="${y}" class="etq">${escapar(etiqueta)}</text>`
                + valor.map((l, k) => `<text x="${x}" y="${y + 44 + k * 44}" class="val">${escapar(l)}</text>`).join('');
        }).join('');
        y += alto + 34;
        return svg;
    }).join('');

    const lugar = cita.modalidad === 'presencial' ? CONFIG.direccion : 'En línea: le enviaremos el enlace antes de la consulta.';
    const finTarjeta = y + 10;
    const alto = finTarjeta + 200;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${alto}">
      <style>
        .etq{font:700 22px 'Segoe UI',Arial,'DejaVu Sans',sans-serif;fill:#1e6c69;letter-spacing:2px}
        .val{font:600 34px 'Segoe UI',Arial,'DejaVu Sans',sans-serif;fill:#1E332C}
        .pie{font:600 26px 'Segoe UI',Arial,'DejaVu Sans',sans-serif;fill:#2C4A41}
      </style>
      <rect width="1080" height="${alto}" fill="#eef6f2"/>
      <rect width="1080" height="330" fill="#1e6c69"/>
      <text x="540" y="210" text-anchor="middle" style="font:600 40px 'Segoe UI',Arial,sans-serif;fill:#CFE5D5">Centro Psicológico</text>
      <text x="540" y="275" text-anchor="middle" style="font:800 68px 'Segoe UI',Arial,sans-serif;fill:#ffffff">SALUS MENS</text>
      <rect x="70" y="300" width="940" height="${finTarjeta - 300}" rx="36" fill="#ffffff" stroke="#CFE5D5" stroke-width="3"/>
      <rect x="330" y="340" width="420" height="64" rx="32" fill="#13883f"/>
      <text x="540" y="383" text-anchor="middle" style="font:800 30px 'Segoe UI',Arial,sans-serif;fill:#ffffff">✓ CITA CONFIRMADA</text>
      ${bloques}
      <text x="540" y="${finTarjeta + 60}" text-anchor="middle" class="pie">${escapar(lugar)}</text>
      <text x="540" y="${finTarjeta + 102}" text-anchor="middle" class="pie">WhatsApp ${CONFIG.telefono} · ${escapar(CONFIG.web.replace('https://', ''))}</text>
      <text x="540" y="${finTarjeta + 156}" text-anchor="middle" style="font:italic 600 26px 'Segoe UI',Arial,sans-serif;fill:#1e6c69">Gracias por su confianza, su salud mental es nuestra prioridad.</text>
    </svg>`;

    const logo = await sharp(LOGO).resize(110, 110, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(Buffer.from(svg))
        .composite([{ input: logo, top: 40, left: 485 }])
        .png()
        .toBuffer();
}

module.exports = { texto, imagen, datos };
