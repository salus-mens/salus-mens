document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('nav');
    const lista = nav && nav.querySelector('.menu-enlaces');
    if (!lista) return;

    // La vista previa de VS Code sirve la carpeta del proyecto (las páginas quedan en /public/...)
    // y no tiene el servidor: ADMIN se abre en el servidor local (npm start) en lugar de dar error.
    if (location.pathname.startsWith('/public/')) {
        lista.querySelectorAll('a[href="/admin/"]').forEach((enlace) => {
            enlace.href = 'http://127.0.0.1:5050/admin/';
        });
    }

    // --- MENÚ DESLIZABLE EN MÓVILES ---
    // Cuando los enlaces no caben en la barra, muestra flechas para desplazarse entre las opciones.

    // Crea una flecha de desplazamiento (-1 = izquierda, 1 = derecha)
    function crearFlecha(direccion) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'flecha-menu';
        boton.innerHTML = direccion < 0 ? '&#8249;' : '&#8250;';
        boton.setAttribute('aria-label', direccion < 0 ? 'Ver opciones anteriores' : 'Ver más opciones');
        boton.hidden = true;
        boton.addEventListener('click', () => {
            lista.scrollBy({ left: direccion * lista.clientWidth * 0.7, behavior: 'smooth' });
        });
        return boton;
    }

    const flechaIzquierda = crearFlecha(-1);
    const flechaDerecha = crearFlecha(1);
    lista.before(flechaIzquierda);
    lista.after(flechaDerecha);

    // Muestra cada flecha solo si quedan opciones ocultas hacia ese lado
    function actualizarFlechas() {
        const maximo = lista.scrollWidth - lista.clientWidth;
        flechaIzquierda.hidden = lista.scrollLeft <= 2;
        flechaDerecha.hidden = lista.scrollLeft >= maximo - 2;
    }

    // --- BOTÓN DE MODO NOCTURNO ---
    const ICONO_LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    const ICONO_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

    const botonTema = document.createElement('button');
    botonTema.type = 'button';
    botonTema.className = 'tema-boton';

    function pintarBotonTema() {
        const oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
        botonTema.innerHTML = oscuro ? ICONO_SOL : ICONO_LUNA;
        botonTema.setAttribute('aria-label', oscuro ? 'Activar modo claro' : 'Activar modo nocturno');
        botonTema.title = oscuro ? 'Modo claro' : 'Modo nocturno';
    }

    botonTema.addEventListener('click', () => {
        const nuevo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nuevo);
        try {
            localStorage.setItem('tema', nuevo);
        } catch (error) {
            // Si no se puede guardar, el cambio dura solo en esta página
        }
        pintarBotonTema();
    });

    pintarBotonTema();
    nav.appendChild(botonTema);

    // Lleva a la vista el enlace de la página actual
    const activo = lista.querySelector('a.activo');
    if (activo && lista.scrollWidth > lista.clientWidth) {
        const li = activo.parentElement;
        lista.scrollLeft = li.offsetLeft - (lista.clientWidth - li.offsetWidth) / 2 - lista.offsetLeft;
    }

    lista.addEventListener('scroll', actualizarFlechas, { passive: true });
    window.addEventListener('resize', actualizarFlechas);
    actualizarFlechas();
});
