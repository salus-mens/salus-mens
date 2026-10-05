// --- RECORRIDO EN VIDEO: ARRASTRAR PARA GIRAR ---
// Cada visor [data-recorrido-video] muestra un tramo del video (data-inicio y data-fin, en segundos).
// Al arrastrar (ratón o dedo) el video avanza o retrocede según el movimiento, como si se mirara alrededor.
// Las flechas del teclado también giran cuando el visor tiene el foco.
document.addEventListener('DOMContentLoaded', () => {
    // Cuántos segundos de video recorre un arrastre de lado a lado del visor
    const SEGUNDOS_POR_ANCHO = 8;

    document.querySelectorAll('[data-recorrido-video]').forEach((visor) => {
        const video = visor.querySelector('video');
        const aviso = visor.querySelector('[data-aviso]');
        const tramo = { inicio: Number(visor.dataset.inicio) || 0, fin: Number(visor.dataset.fin) || Infinity };

        let destino = tramo.inicio;
        let arrastrando = false;
        let ultimoX = 0;

        // Mueve el video hacia "destino" como máximo 25 veces por segundo, para no saturar al navegador
        // con saltos mientras se arrastra (un salto nuevo reemplaza al anterior si aún no terminó)
        let pendiente = null;
        function pintar() {
            if (pendiente) return;
            pendiente = setTimeout(() => {
                pendiente = null;
                if (Math.abs(video.currentTime - destino) > 0.02) {
                    video.currentTime = destino;
                }
            }, 40);
        }

        function girar(segundos) {
            destino = Math.min(tramo.fin, Math.max(tramo.inicio, destino + segundos));
            pintar();
        }

        visor.addEventListener('pointerdown', (evento) => {
            arrastrando = true;
            ultimoX = evento.clientX;
            try {
                visor.setPointerCapture(evento.pointerId);
            } catch (error) {
                // Algunos navegadores no permiten capturar el puntero; el arrastre funciona igual
            }
            visor.classList.add('arrastrando');
            aviso.hidden = true;
        });

        visor.addEventListener('pointermove', (evento) => {
            if (!arrastrando) return;
            const dx = evento.clientX - ultimoX;
            ultimoX = evento.clientX;
            // Arrastrar hacia la izquierda gira hacia adelante, como al mirar alrededor
            girar((-dx / visor.clientWidth) * SEGUNDOS_POR_ANCHO);
        });

        function soltar() {
            arrastrando = false;
            visor.classList.remove('arrastrando');
        }
        visor.addEventListener('pointerup', soltar);
        visor.addEventListener('pointercancel', soltar);

        visor.addEventListener('keydown', (evento) => {
            if (evento.key === 'ArrowRight') girar(0.5);
            else if (evento.key === 'ArrowLeft') girar(-0.5);
            else return;
            evento.preventDefault();
            aviso.hidden = true;
        });

        // Cuando se conoce la duración, se ajusta el final del tramo y se muestra su primer cuadro
        // (si el video ya cargó desde la caché, el evento no vuelve a ocurrir)
        function iniciar() {
            tramo.fin = Math.min(tramo.fin, video.duration - 0.05);
            destino = tramo.inicio;
            pintar();
        }
        if (video.readyState >= 1) iniciar();
        else video.addEventListener('loadedmetadata', iniciar, { once: true });
    });
});
