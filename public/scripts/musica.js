// --- MÚSICA DE FONDO RELAJANTE (página de inicio) ---
// Pieza ambiental original (audio/sala-de-espera.mp3, libre de derechos) que se repite sin cortes.
// Los navegadores no permiten sonido automático: empieza cuando el visitante pulsa ▶.
// Se reproduce con el elemento <audio> (empieza a sonar mientras descarga) y el volumen pasa por
// Web Audio, que permite subir y bajar suavemente y funciona también en iPhone (Safari ignora audio.volume).
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.querySelector('[data-musica]');
    if (!panel) return;

    const botonPlay = panel.querySelector('[data-musica-play]');
    const botonMenos = panel.querySelector('[data-musica-menos]');
    const botonMas = panel.querySelector('[data-musica-mas]');
    const barras = [...panel.querySelectorAll('.musica-nivel span')];
    const texto = panel.querySelector('[data-musica-texto]');

    const ARCHIVO = 'audio/sala-de-espera.mp3';
    const PASOS = barras.length; // niveles de volumen
    const CLAVE_VOLUMEN = 'musica-volumen';

    let nivel = 4;
    try {
        const guardado = Number(localStorage.getItem(CLAVE_VOLUMEN));
        if (guardado >= 1 && guardado <= PASOS) nivel = guardado;
    } catch (error) { /* sin memoria */ }

    let contexto = null;
    let ganancia = null;
    let audio = null;
    let sonando = false;
    let ocupado = false; // evita que dos clics seguidos se crucen mientras carga

    // El oído percibe el volumen de forma logarítmica: los niveles se reparten en curva
    const volumenDe = (n) => (n / PASOS) ** 2 * 0.9;

    function pintar() {
        barras.forEach((barra, i) => barra.classList.toggle('activa', i < nivel));
        botonPlay.innerHTML = sonando ? '&#10074;&#10074;' : '&#9654;';
        botonPlay.setAttribute('aria-label', sonando ? 'Pausar música' : 'Reproducir música relajante');
        botonPlay.setAttribute('aria-pressed', String(sonando));
        botonMenos.disabled = nivel <= 1;
        botonMas.disabled = nivel >= PASOS;
        panel.classList.toggle('sonando', sonando);
        panel.setAttribute('aria-valuetext', `Volumen ${Math.round((nivel / PASOS) * 100)} %`);
    }

    function aplicarVolumen(segundos) {
        if (!ganancia) {
            // Navegador sin Web Audio: se usa el volumen del propio audio
            if (audio) audio.volume = sonando ? volumenDe(nivel) : 0;
            return;
        }
        const ahora = contexto.currentTime;
        ganancia.gain.cancelScheduledValues(ahora);
        ganancia.gain.setValueAtTime(ganancia.gain.value, ahora);
        ganancia.gain.linearRampToValueAtTime(sonando ? volumenDe(nivel) : 0, ahora + segundos);
    }

    function iniciar() {
        audio = new Audio(ARCHIVO);
        audio.loop = true;
        audio.preload = 'auto';
        const Contexto = window.AudioContext || window.webkitAudioContext;
        if (Contexto) {
            contexto = new Contexto();
            ganancia = contexto.createGain();
            ganancia.gain.value = 0;
            contexto.createMediaElementSource(audio).connect(ganancia);
            ganancia.connect(contexto.destination);
        }
    }

    botonPlay.addEventListener('click', async () => {
        if (ocupado) return;
        ocupado = true;
        try {
            if (!audio) iniciar();
            if (!sonando) {
                texto.textContent = 'Cargando…';
                if (contexto) await contexto.resume();
                await audio.play();
                sonando = true;
                texto.textContent = 'Música relajante';
                aplicarVolumen(2.5); // entra suave
            } else {
                sonando = false;
                aplicarVolumen(1);   // sale suave y luego se pausa
                setTimeout(() => { if (!sonando) audio.pause(); }, 1100);
            }
        } catch (error) {
            texto.textContent = 'No se pudo reproducir';
            sonando = false;
        }
        ocupado = false;
        pintar();
    });

    function cambiarNivel(delta) {
        nivel = Math.min(PASOS, Math.max(1, nivel + delta));
        try { localStorage.setItem(CLAVE_VOLUMEN, String(nivel)); } catch (error) { /* sin memoria */ }
        aplicarVolumen(0.3);
        pintar();
    }

    botonMenos.addEventListener('click', () => cambiarNivel(-1));
    botonMas.addEventListener('click', () => cambiarNivel(1));

    pintar();
});
