// --- PANEL DE CITAS (solo administradores) ---
// /admin-citas: el psicólogo revisa las reservas, verifica el abono con el banco y confirma.
// Al confirmar, el paciente recibe el mensaje de agendamiento y la imagen de su cita.
const path = require('path');
const express = require('express');
const agenda = require('./agenda');
const confirmacion = require('./confirmacion');
const canales = require('./canales');

const CANALES = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', prueba: 'Prueba' };

function datosPublicos(c) {
    const [canal, usuario] = c.conversacion.split(/:(.*)/s);
    return {
        id: c.id, estado: c.estado, estado_texto: c.estado_texto, fecha: c.fecha, hora: c.hora,
        nombre: c.nombre, edad: c.edad, consulta: c.consulta, modalidad: c.modalidad,
        motivo: c.motivo_area + (c.motivo_detalle ? ` — ${c.motivo_detalle}` : ''),
        valor: c.valor, abono: c.abono, canal: CANALES[canal] || canal,
        chat: canal === 'whatsapp' ? `https://wa.me/${usuario}` : null,
        imagen: c.estado === 'confirmada' ? `/cita/${c.token}.png` : null
    };
}

const enlaceImagen = (req, cita) => `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/cita/${cita.token}.png`;
const canalDe = (cita) => { const [canal, usuario] = cita.conversacion.split(/:(.*)/s); return { canal, usuario }; };

const MENSAJES = {
    no_valido: '*Salus Mens*: no pudimos verificar su abono con el banco. 🙏 Por favor, revise los datos de la transferencia y envíe nuevamente el comprobante por este chat. Su horario sigue reservado.',
    cancelada: '*Salus Mens*: le informamos que su reserva fue *cancelada*. Si desea agendar un nuevo horario, escríbanos *3*. Gracias por su comprensión. 🌻'
};

async function avisarPaciente(cita, accion, req) {
    const { canal, usuario } = canalDe(cita);
    if (!['whatsapp', 'messenger', 'instagram'].includes(canal)) return 'sin canal (cita de prueba)';
    try {
        if (accion === 'confirmada') {
            await canales.enviarImagen(canal, usuario, await confirmacion.imagen(cita),
                { pie: confirmacion.texto(cita), enlacePublico: enlaceImagen(req, cita) });
        } else {
            await canales.enviar(canal, usuario, MENSAJES[accion]);
        }
        return 'enviado';
    } catch (error) {
        console.error('[Panel] No se pudo avisar al paciente:', error.message);
        // Normalmente pasa si el paciente escribió hace más de 24 h (regla de WhatsApp)
        return 'no se pudo enviar: ' + error.message.slice(0, 160);
    }
}

function crearRutas(requiereAdmin) {
    const rutas = express.Router();

    rutas.get('/admin-citas', requiereAdmin, (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

    rutas.get('/api/citas', requiereAdmin, (req, res) => {
        res.json({ citas: agenda.listarParaPanel().map(datosPublicos) });
    });

    const acciones = {
        confirmar: [agenda.confirmarPago, 'confirmada'],
        'no-valido': [agenda.pagoNoValido, 'no_valido'],
        cancelar: [agenda.cancelarPorId, 'cancelada']
    };
    rutas.post('/api/citas/:id/:accion', requiereAdmin, async (req, res) => {
        const accion = acciones[req.params.accion];
        if (!accion) return res.status(404).json({ error: 'Acción desconocida.' });
        // Protección extra: solo se aceptan peticiones hechas desde la propia página
        const origen = req.get('origin');
        if (origen && new URL(origen).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });

        const resultado = await accion[0](Number(req.params.id));
        if (resultado.error) return res.status(400).json(resultado);
        const aviso = await avisarPaciente(resultado.cita, accion[1], req);
        res.json({ ok: true, aviso });
    });

    // Imagen de la cita: pública pero con un código secreto imposible de adivinar
    rutas.get('/cita/:token.png', async (req, res) => {
        const cita = agenda.citaPorToken(req.params.token);
        if (!cita) return res.sendStatus(404);
        res.type('png').set('Content-Disposition', `inline; filename="cita-salus-mens-${cita.inicio.slice(0, 10)}.png"`)
            .send(await confirmacion.imagen(cita));
    });

    return rutas;
}

module.exports = { crearRutas };
