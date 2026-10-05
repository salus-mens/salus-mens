// --- INICIAR SESIÓN / CREAR CUENTA / RECUPERAR CONTRASEÑA ---
// Se muestra un solo panel a la vez. El panel se elige con la dirección (#registro, #olvide),
// así los enlaces "Volver" del servidor regresan directamente al formulario correcto.
document.addEventListener('DOMContentLoaded', () => {
    const paneles = document.querySelectorAll('[data-panel]');

    // Si se llegó aquí desde una página protegida (por ejemplo, ADMIN), se vuelve a ella al entrar
    const volverPedido = new URLSearchParams(location.search).get('volver') || '';
    const volver = /^\/(?![\/\\])[\w\-./]*$/.test(volverPedido) ? volverPedido : '';
    const campoVolver = document.querySelector('input[name="volver"]');
    if (campoVolver) campoVolver.value = volver;

    // Si ya hay una sesión iniciada, se entra directo al área exclusiva
    if (paneles.length) {
        fetch('/api/sesion').then((respuesta) => {
            if (respuesta.ok) location.replace(volver || '/miembros/');
        }).catch(() => { });
    }

    function mostrarPanel(nombre, enfocar) {
        const existe = [...paneles].some((panel) => panel.dataset.panel === nombre);
        const elegido = existe ? nombre : 'login';

        paneles.forEach((panel) => {
            panel.hidden = panel.dataset.panel !== elegido;
            if (!panel.hidden && enfocar) {
                const primerCampo = panel.querySelector('input:not([type="hidden"])');
                if (primerCampo) primerCampo.focus();
            }
        });
    }

    if (paneles.length) {
        document.querySelectorAll('[data-mostrar]').forEach((boton) => {
            boton.addEventListener('click', () => {
                const nombre = boton.dataset.mostrar;
                history.replaceState(null, '', nombre === 'login' ? location.pathname : '#' + nombre);
                mostrarPanel(nombre, true);
            });
        });

        window.addEventListener('hashchange', () => mostrarPanel(location.hash.slice(1), true));
        mostrarPanel(location.hash.slice(1), false);
    }

    // --- RECUPERAR CON PREGUNTAS DE SEGURIDAD ---
    // Paso 1: se piden al servidor las preguntas de la cuenta. Paso 2: se responden y se elige la nueva contraseña.
    const formPreguntas = document.querySelector('[data-recuperar-preguntas]');
    if (formPreguntas) {
        const campoId = formPreguntas.querySelector('[name="identificador"]');
        const botonPaso1 = formPreguntas.querySelector('[data-paso1]');
        const paso2 = formPreguntas.querySelector('[data-paso2]');
        const error = formPreguntas.querySelector('[data-error-preguntas]');

        async function continuar() {
            error.textContent = '';
            campoId.dispatchEvent(new Event('blur'));
            if (!campoId.value.trim() || campoId.classList.contains('invalido')) {
                campoId.focus();
                return;
            }

            botonPaso1.disabled = true;
            try {
                const respuesta = await fetch('/api/preguntas?identificador=' + encodeURIComponent(campoId.value.trim()));
                const datos = await respuesta.json();
                if (!respuesta.ok) throw new Error(datos.error);

                datos.preguntas.forEach((texto, i) => {
                    formPreguntas.querySelector(`[data-texto-pregunta="${i}"]`).textContent = texto;
                });
                campoId.readOnly = true;
                botonPaso1.hidden = true;
                paso2.hidden = false;
                paso2.querySelector('input').focus();
            } catch (problema) {
                error.textContent = problema.message || 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
            } finally {
                botonPaso1.disabled = false;
            }
        }

        botonPaso1.addEventListener('click', continuar);

        // Enter en el paso 1 continúa en lugar de enviar el formulario
        formPreguntas.addEventListener('submit', (evento) => {
            if (paso2.hidden) {
                evento.preventDefault();
                continuar();
            }
        });
    }

    // --- PÁGINA DE NUEVA CONTRASEÑA: toma el código del enlace recibido por correo ---
    const campoToken = document.querySelector('input[name="token"]');
    if (campoToken) {
        const token = new URLSearchParams(location.search).get('token') || '';
        campoToken.value = token;
        if (!/^[a-f0-9]{64}$/.test(token)) {
            document.querySelector('[data-con-token]').hidden = true;
            document.querySelector('[data-sin-token]').hidden = false;
        }
    }
});
