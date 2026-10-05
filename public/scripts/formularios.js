// --- VALIDACIÓN DE FORMULARIOS Y MOSTRAR / OCULTAR CONTRASEÑA ---
// Cada campo indica qué revisar con el atributo data-validar:
//   nombre · email · usuario-o-email · celular (con data-pais="id del select") · password-nueva
//   confirmar (con data-igual-a="id") · pregunta (con data-distinta-de="id") · respuesta · mensaje
// Las mismas reglas se vuelven a comprobar en el servidor.
document.addEventListener('DOMContentLoaded', () => {

    const REGLAS = {
        nombre(valor) {
            if (valor.length < 3) return 'Escribe al menos 3 letras.';
            if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/.test(valor)) return 'Usa solo letras y espacios.';
            return '';
        },
        email(valor) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)
                ? '' : 'Escribe un correo válido, por ejemplo nombre@correo.com.';
        },
        'usuario-o-email'(valor) {
            if (valor.includes('@')) return REGLAS.email(valor);
            return /^[A-Za-z0-9._-]{3,30}$/.test(valor)
                ? '' : 'Escribe tu correo o tu usuario (letras, números, punto, guion o guion bajo).';
        },
        // Celular de cualquier país, según el país elegido en el selector (libphonenumber)
        celular(valor, campo) {
            const lib = window.libphonenumber;
            if (!lib) return ''; // Si la librería no cargó, lo revisa el servidor
            const selector = document.getElementById(campo.dataset.pais);
            const pais = selector ? selector.value : undefined;
            if (!lib.isValidPhoneNumber(valor, pais)) {
                const nombre = selector ? selector.options[selector.selectedIndex].text.replace(/^\+\d+\s*/, '') : '';
                return `Escribe un número de celular válido${nombre ? ' de ' + nombre : ''}.`;
            }
            return '';
        },
        'password-nueva'(valor) {
            if (valor.length < 8) return 'Debe tener al menos 8 caracteres.';
            if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) return 'Debe incluir letras y números.';
            return '';
        },
        confirmar(valor, campo) {
            const original = document.getElementById(campo.dataset.igualA);
            return original && valor !== original.value ? 'Las contraseñas no coinciden.' : '';
        },
        pregunta(valor, campo) {
            const otra = document.getElementById(campo.dataset.distintaDe);
            return otra && otra.value === valor ? 'Elige una pregunta distinta a la anterior.' : '';
        },
        respuesta(valor) {
            if (valor.length < 2) return 'Escribe al menos 2 caracteres.';
            if (valor.length > 60) return 'Máximo 60 caracteres.';
            return '';
        },
        'nombre-pedido'(valor) {
            return valor.length < 3 ? 'Escribe al menos 3 caracteres.' : '';
        },
        mensaje(valor) {
            return valor.length < 10 ? 'Cuéntanos un poco más (mínimo 10 caracteres).' : '';
        }
    };

    // Devuelve el mensaje de error del campo, o '' si es correcto
    function revisar(campo) {
        const valor = campo.type === 'password' ? campo.value : campo.value.trim();
        if (!valor) return campo.required ? 'Este campo es obligatorio.' : '';
        const regla = REGLAS[campo.dataset.validar];
        return regla ? regla(valor, campo) : '';
    }

    // Crea (una sola vez) el espacio donde se muestra el error debajo del campo
    function obtenerMensaje(campo) {
        let mensaje = document.getElementById('error-' + campo.id);
        if (!mensaje) {
            mensaje = document.createElement('small');
            mensaje.className = 'mensaje-error';
            mensaje.id = 'error-' + campo.id;
            mensaje.setAttribute('aria-live', 'polite');
            campo.closest('.input-group').appendChild(mensaje);
            const descripcion = campo.getAttribute('aria-describedby');
            campo.setAttribute('aria-describedby', descripcion ? descripcion + ' ' + mensaje.id : mensaje.id);
        }
        return mensaje;
    }

    function validar(campo) {
        const error = revisar(campo);
        obtenerMensaje(campo).textContent = error;
        campo.classList.toggle('invalido', Boolean(error));
        campo.classList.toggle('valido', !error && Boolean(campo.value.trim()));
        campo.setAttribute('aria-invalid', error ? 'true' : 'false');
        return !error;
    }

    document.querySelectorAll('form').forEach((formulario) => {
        const campos = [...formulario.querySelectorAll('input, select, textarea')]
            .filter((campo) => campo.type !== 'hidden' && campo.id && campo.closest('.input-group'));

        // Se reemplazan los globos del navegador por mensajes propios en español
        formulario.noValidate = true;

        campos.forEach((campo) => {
            // Revisa al salir del campo y, una vez revisado, mientras se escribe
            campo.addEventListener('blur', () => {
                if (campo.value) validar(campo);
            });
            campo.addEventListener('input', () => {
                if (campo.classList.contains('invalido') || campo.classList.contains('valido')) validar(campo);

                // Si cambia un campo del que dependen otros (contraseña, país, pregunta), se revisan también
                formulario.querySelectorAll(`[data-igual-a="${campo.id}"], [data-pais="${campo.id}"], [data-distinta-de="${campo.id}"]`)
                    .forEach((dependiente) => {
                        if (dependiente.value) validar(dependiente);
                    });
            });

            // Los <select> avisan sus cambios con "change"
            if (campo.tagName === 'SELECT') {
                campo.addEventListener('change', () => campo.dispatchEvent(new Event('input')));
            }
        });

        formulario.addEventListener('submit', (evento) => {
            // Los campos de pasos ocultos (por ejemplo, la recuperación con preguntas) no se revisan
            const invalidos = campos.filter((campo) => !campo.closest('[hidden]') && !validar(campo));
            if (invalidos.length) {
                evento.preventDefault();
                invalidos[0].focus();
            }
        });
    });

    // --- MOSTRAR / OCULTAR CONTRASEÑA ---
    const OJO_ABIERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const OJO_CERRADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

    document.querySelectorAll('input[type="password"]').forEach((campo) => {
        const envoltura = document.createElement('div');
        envoltura.className = 'campo-password';
        campo.before(envoltura);
        envoltura.appendChild(campo);

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'ver-password';
        envoltura.appendChild(boton);

        function pintar() {
            const visible = campo.type === 'text';
            boton.innerHTML = visible ? OJO_CERRADO : OJO_ABIERTO;
            boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
            boton.setAttribute('aria-pressed', String(visible));
        }

        boton.addEventListener('click', () => {
            campo.type = campo.type === 'password' ? 'text' : 'password';
            pintar();
            campo.focus();
        });

        pintar();
    });
});
