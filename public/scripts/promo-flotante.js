// --- CUADROS FLOTANTES (estilo TikTok): PROMOCIONES Y REDES SOCIALES ---
// Dos cuadros con el mismo comportamiento, cada uno con sus datos (se editan sin código desde /admin):
//   · Promociones (esquina derecha):   datos/promociones.json → al tocarlo abre la página Promociones.
//   · Redes sociales (esquina izquierda): datos/redes.json   → al tocarlo abre la publicación en la red.
// - Se arrastran con el ratón o el dedo; toman la forma de cada foto o video (vertical u horizontal).
// - Los videos se reproducen en silencio y las fotos cambian cada 5 segundos.
// - Con la ✕ se cierran hasta que se vuelva a abrir el navegador.
// - Si no hay publicaciones vigentes, no aparecen.
document.addEventListener('DOMContentLoaded', () => {
    const SEGUNDOS_FOTO = 5;
    const MAX_SEGUNDOS_VIDEO = 30;
    const EXT_VIDEO = /\.(mp4|webm|m4v|mov)$/i;
    // Solo se usan como portada archivos de foto o video (no enlaces a páginas, como un link de TikTok)
    const EXT_MEDIO = /\.(jpe?g|png|webp|gif|avif|mp4|webm|m4v|mov)(\?.*)?$/i;
    const SEGUNDOS_PUBLICACION_RED = 20;
    const hoy = new Date().toISOString().slice(0, 10);

    // Publicación real de la red dentro del cuadro (reproductor oficial de cada red).
    // Se necesita el enlace completo de la publicación: los enlaces cortos (vt.tiktok.com,
    // facebook.com/share, lnkd.in) no indican qué publicación es y no se pueden averiguar desde la página.
    // ancho/alto: tamaño natural del reproductor; se reduce para que quepa en el cuadro.
    // vista (opcional): franja que se muestra (por ejemplo, solo la foto o video de Instagram, sin encabezado).
    function reproductorDe(p) {
        const enlace = p.enlace || '';
        let id;
        switch (p.red) {
            case 'TikTok':
                id = enlace.match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/);
                return id && {
                    src: `https://www.tiktok.com/player/v1/${id[1]}?autoplay=1&muted=1&loop=1&controls=0&description=0&music_info=0&rel=0`,
                    ancho: 325,
                    alto: 580
                };
            case 'Instagram':
                id = enlace.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/);
                return id && {
                    src: `https://www.instagram.com/${id[1]}/${id[2]}/embed/`,
                    ancho: 326,
                    alto: 760,
                    vista: { y: 54, alto: 408 }
                };
            case 'LinkedIn':
                id = enlace.match(/urn:li:(activity|ugcPost|share):(\d+)/)
                    || enlace.match(/-(activity|ugcPost|share)-(\d+)/);
                return id && {
                    src: `https://www.linkedin.com/embed/feed/update/urn:li:${id[1]}:${id[2]}?compact=true`,
                    ancho: 350,
                    alto: 600
                };
            case 'Facebook':
                // Solo enlaces completos y públicos (no funciona con facebook.com/share/...)
                if (!/facebook\.com\//.test(enlace) || /facebook\.com\/share\//.test(enlace)) return null;
                return {
                    src: (/\/(videos|reel)\/|watch/.test(enlace)
                        ? 'https://www.facebook.com/plugins/video.php?show_text=false&width=350&href='
                        : 'https://www.facebook.com/plugins/post.php?show_text=false&width=350&href=') + encodeURIComponent(enlace),
                    ancho: 350,
                    alto: 500
                };
            default:
                return null;
        }
    }

    // Color de fondo para publicaciones de redes sin imagen de portada
    const COLORES_RED = {
        TikTok: 'linear-gradient(135deg, #111 0%, #25f4ee 55%, #fe2c55 100%)',
        Instagram: 'linear-gradient(135deg, #feda75 0%, #d62976 50%, #4f5bd5 100%)',
        Facebook: 'linear-gradient(135deg, #1877f2 0%, #0b4fb3 100%)',
        LinkedIn: 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)'
    };

    // sessionStorage puede no estar disponible (navegación privada): se trabaja sin recordar nada
    function leer(clave) {
        try { return sessionStorage.getItem(clave); } catch (error) { return null; }
    }
    function guardar(clave, valor) {
        try { sessionStorage.setItem(clave, valor); } catch (error) { /* sin memoria */ }
    }

    // El panel guarda rutas como "/Images/promociones/foto.jpg". Se usan relativas a la página
    // ("Images/...") para que funcionen igual con npm start, en Netlify y en la vista previa de VS Code.
    // Las direcciones completas (https://...) se dejan como están.
    function rutaArchivo(ruta) {
        return /^\/(?!\/)/.test(ruta) ? ruta.slice(1) : ruta;
    }

    async function cargar(archivo) {
        try {
            const respuesta = await fetch(archivo, { cache: 'no-store' });
            const datos = await respuesta.json();
            return (datos.publicaciones || []).filter((p) =>
                p.publicada !== false && (!p.hasta || p.hasta.slice(0, 10) >= hoy));
        } catch (error) {
            return [];
        }
    }

    // --- PROMOCIONES ---
    if (!location.pathname.endsWith('promociones.html')) {
        cargar('datos/promociones.json').then((lista) => crearCuadro({
            nombre: 'promo',
            lado: 'derecha',
            etiquetaAccesible: 'Promociones de Salus Mens. Toca para ver todas.',
            items: lista.filter((p) => p.archivo).map((p) => ({
                archivo: p.archivo,
                etiqueta: p.tipo || 'Promoción',
                titulo: p.titulo,
                destino: 'promociones.html',
                nuevaPestana: false
            }))
        }));
    }

    // --- REDES SOCIALES ---
    cargar('datos/redes.json').then((lista) => crearCuadro({
        nombre: 'redes',
        lado: 'izquierda',
        etiquetaAccesible: 'Publicaciones de Salus Mens en redes sociales. Toca para abrir la publicación.',
        // Solo enlaces https: así nunca se abre algo que no sea una página web
        items: lista.filter((p) => /^https:\/\//i.test(p.enlace || '')).map((p) => ({
            archivo: EXT_MEDIO.test(p.archivo || '') ? p.archivo : '',
            etiqueta: p.red || 'Redes',
            titulo: p.titulo,
            destino: p.enlace,
            nuevaPestana: true,
            fondo: COLORES_RED[p.red],
            reproductor: reproductorDe(p)
        }))
    }));

    // --- Evitar que los dos cuadros se tapen ---
    // Si en pantallas angostas no caben lado a lado, el de redes (izquierda) sube encima del de promociones.
    // Los cuadros que el visitante movió a mano se dejan donde los puso.
    function acomodarCuadros() {
        const izquierda = document.querySelector('.promo-flotante.flotante-izquierda');
        const derecha = document.querySelector('.promo-flotante.flotante-derecha');
        if (!izquierda || izquierda.style.left) return;
        izquierda.style.bottom = '';
        if (!derecha || derecha.style.left) return;
        const a = izquierda.getBoundingClientRect();
        const b = derecha.getBoundingClientRect();
        const seTapan = a.right + 8 > b.left && a.bottom + 8 > b.top;
        if (seTapan) izquierda.style.bottom = Math.round(window.innerHeight - b.top + 8) + 'px';
    }
    window.addEventListener('resize', () => setTimeout(acomodarCuadros, 450));

    function crearCuadro({ nombre, lado, etiquetaAccesible, items }) {
        const CLAVE_CERRADO = `${nombre}-flotante-cerrado`;
        const CLAVE_POSICION = `${nombre}-flotante-posicion`;
        if (!items.length || leer(CLAVE_CERRADO)) return;

        // --- Estructura ---
        const caja = document.createElement('aside');
        caja.className = `promo-flotante flotante-${lado}`;
        caja.setAttribute('aria-label', etiquetaAccesible);
        caja.tabIndex = 0;

        const progreso = document.createElement('div');
        progreso.className = 'promo-progreso';
        items.forEach(() => progreso.appendChild(document.createElement('span')));

        const medio = document.createElement('div');
        medio.className = 'promo-medio';

        const info = document.createElement('div');
        info.className = 'promo-info';
        const tipo = document.createElement('span');
        tipo.className = 'promo-tipo';
        const titulo = document.createElement('p');
        titulo.className = 'promo-titulo';
        info.append(tipo, titulo);

        const cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.className = 'promo-cerrar';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.innerHTML = '&times;';

        caja.append(medio, progreso, info, cerrar);

        // Flechas para pasar de publicación cuando el visitante quiera (solo si hay más de una)
        function crearFlecha(clase, texto, etiqueta) {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = `promo-flecha ${clase}`;
            boton.innerHTML = texto;
            boton.setAttribute('aria-label', etiqueta);
            caja.appendChild(boton);
            return boton;
        }
        const anterior = crearFlecha('promo-anterior', '&#8249;', 'Publicación anterior');
        const proxima = crearFlecha('promo-siguiente', '&#8250;', 'Publicación siguiente');
        document.body.appendChild(caja);

        // --- Posición guardada (si el visitante lo movió antes en esta visita) ---
        function ubicar(x, y) {
            const maxX = window.innerWidth - caja.offsetWidth - 8;
            const maxY = window.innerHeight - caja.offsetHeight - 8;
            caja.style.left = Math.min(Math.max(8, x), maxX) + 'px';
            caja.style.top = Math.min(Math.max(8, y), maxY) + 'px';
            caja.style.right = 'auto';
            caja.style.bottom = 'auto';
        }
        const posicion = leer(CLAVE_POSICION);
        if (posicion) {
            const [x, y] = posicion.split(',').map(Number);
            ubicar(x, y);
        }
        window.addEventListener('resize', () => {
            if (caja.style.left) ubicar(caja.offsetLeft, caja.offsetTop);
        });

        // --- Forma del cuadro según la publicación ---
        // El lado más largo mide siempre lo mismo; el otro se calcula con la proporción del archivo.
        // La proporción se limita entre 9:16 y 16:9 para que nunca quede demasiado angosto.
        function ajustarForma(ancho, alto) {
            if (!ancho || !alto) return;
            const proporcion = Math.min(16 / 9, Math.max(9 / 16, ancho / alto));
            // En celular es más pequeño para que quepan los dos cuadros (promociones y redes) sin taparse
            const ladoLargo = window.innerWidth <= 768 ? 150 : 260;
            const w = proporcion >= 1 ? ladoLargo : ladoLargo * proporcion;
            const h = proporcion >= 1 ? ladoLargo / proporcion : ladoLargo;
            caja.style.width = Math.round(w) + 'px';
            caja.style.height = Math.round(h) + 'px';
            caja.classList.toggle('horizontal', proporcion > 1);
            escalarReproductor();

            // Si el visitante lo movió, se asegura de que el nuevo tamaño no se salga de la pantalla
            if (caja.style.left) {
                setTimeout(() => ubicar(caja.offsetLeft, caja.offsetTop), 400);
            }
            // Al cambiar de tamaño (animación de 0.4 s) se revisa que no tape al otro cuadro
            setTimeout(acomodarCuadros, 450);
        }

        // El reproductor de la red tiene un tamaño fijo: se reduce para llenar el cuadro
        function escalarReproductor() {
            const marco = medio.querySelector('.promo-embed');
            if (!marco) return;
            const escala = parseFloat(caja.style.width) / marco.offsetWidth;
            // Con "vista" se sube el reproductor para mostrar solo la foto o el video
            marco.style.transform = `scale(${escala}) translateY(-${Number(marco.dataset.vistaY) || 0}px)`;
        }

        // --- Reproducción en carrusel ---
        let indice = 0;
        let temporizador = null;

        function avanzarBarra(barra, segundos) {
            barra.style.animationDuration = segundos + 's';
            barra.className = 'activo';
            temporizador = setTimeout(siguiente, segundos * 1000);
        }

        function mostrar(i) {
            indice = i % items.length;
            const item = items[indice];
            clearTimeout(temporizador);
            medio.innerHTML = '';
            medio.style.background = '';

            [...progreso.children].forEach((barra, n) => {
                barra.className = n < indice ? 'visto' : '';
            });
            const barraActual = progreso.children[indice];
            void progreso.offsetWidth; // reinicia la animación de la barra si se repite la misma publicación

            if (item.reproductor) {
                // Publicación real de la red (TikTok) dentro del cuadro
                const marco = document.createElement('iframe');
                marco.className = 'promo-embed';
                marco.src = item.reproductor.src;
                marco.title = item.titulo || item.etiqueta;
                marco.allow = 'autoplay; encrypted-media';
                marco.style.width = item.reproductor.ancho + 'px';
                marco.style.height = item.reproductor.alto + 'px';
                const vista = item.reproductor.vista;
                if (vista) marco.dataset.vistaY = vista.y;
                medio.appendChild(marco);
                ajustarForma(item.reproductor.ancho, vista ? vista.alto : item.reproductor.alto);
                // Con una sola publicación se queda fija (no se recarga el reproductor)
                if (items.length > 1) avanzarBarra(barraActual, SEGUNDOS_PUBLICACION_RED);
                else barraActual.className = 'visto';
            } else if (!item.archivo) {
                // Publicación de red social sin portada: cuadro con los colores de la red
                const sinMedio = document.createElement('div');
                sinMedio.className = 'promo-sin-medio';
                sinMedio.textContent = item.etiqueta;
                medio.style.background = item.fondo || 'var(--boton)';
                medio.appendChild(sinMedio);
                ajustarForma(1, 1);
                avanzarBarra(barraActual, SEGUNDOS_FOTO);
            } else {
                let elemento;
                if (EXT_VIDEO.test(item.archivo)) {
                    elemento = document.createElement('video');
                    elemento.src = rutaArchivo(item.archivo);
                    elemento.muted = true;
                    elemento.autoplay = true;
                    elemento.playsInline = true;
                    elemento.addEventListener('ended', siguiente);
                    elemento.addEventListener('loadedmetadata', () => {
                        ajustarForma(elemento.videoWidth, elemento.videoHeight);
                        avanzarBarra(barraActual, Math.min(elemento.duration || MAX_SEGUNDOS_VIDEO, MAX_SEGUNDOS_VIDEO));
                    });
                } else {
                    elemento = document.createElement('img');
                    elemento.src = rutaArchivo(item.archivo);
                    elemento.alt = '';
                    elemento.addEventListener('load', () => ajustarForma(elemento.naturalWidth, elemento.naturalHeight));
                    avanzarBarra(barraActual, SEGUNDOS_FOTO);
                }
                elemento.addEventListener('error', () => descartar(item));
                medio.appendChild(elemento);
            }

            caja.classList.toggle('con-fondo-red', !item.archivo);
            tipo.textContent = item.etiqueta;
            titulo.textContent = item.titulo || '';
        }

        // Si un archivo no carga: en redes se muestra el cuadro con los colores de la red;
        // en promociones se quita de la lista y, si no queda ninguna, el cuadro se oculta
        function descartar(item) {
            clearTimeout(temporizador);
            const i = items.indexOf(item);
            if (i === -1) return;
            if (item.fondo !== undefined || item.nuevaPestana) {
                item.archivo = '';
                mostrar(i);
                return;
            }
            items.splice(i, 1);
            progreso.children[i].remove();
            actualizarFlechas();
            if (!items.length) {
                caja.remove();
                acomodarCuadros();
                return;
            }
            mostrar(i);
        }

        function previa() {
            mostrar((indice - 1 + items.length) % items.length);
        }

        function actualizarFlechas() {
            anterior.hidden = proxima.hidden = items.length < 2;
        }

        anterior.addEventListener('click', previa);
        proxima.addEventListener('click', siguiente);

        function siguiente() {
            mostrar(indice + 1);
        }

        function abrir() {
            const item = items[indice];
            if (item.nuevaPestana) window.open(item.destino, '_blank', 'noopener');
            else location.href = item.destino;
        }

        // --- Arrastrar o tocar ---
        let inicio = null;
        let movido = false;

        caja.addEventListener('pointerdown', (evento) => {
            // Los botones (✕ y flechas) no inician el arrastre
            if (evento.target.closest('button')) return;
            inicio = { x: evento.clientX, y: evento.clientY, left: caja.offsetLeft, top: caja.offsetTop };
            movido = false;
            try { caja.setPointerCapture(evento.pointerId); } catch (error) { /* el arrastre funciona igual */ }
        });

        caja.addEventListener('pointermove', (evento) => {
            if (!inicio) return;
            const dx = evento.clientX - inicio.x;
            const dy = evento.clientY - inicio.y;
            if (!movido && Math.hypot(dx, dy) < 6) return; // un toque pequeño no cuenta como arrastre
            movido = true;
            caja.classList.add('arrastrando');
            ubicar(inicio.left + dx, inicio.top + dy);
        });

        caja.addEventListener('pointerup', () => {
            if (!inicio) return;
            inicio = null;
            caja.classList.remove('arrastrando');
            if (movido) {
                guardar(CLAVE_POSICION, `${caja.offsetLeft},${caja.offsetTop}`);
                acomodarCuadros();
            } else {
                abrir();
            }
        });

        caja.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') abrir();
            else if (evento.key === 'ArrowRight' && items.length > 1) siguiente();
            else if (evento.key === 'ArrowLeft' && items.length > 1) previa();
        });

        cerrar.addEventListener('click', () => {
            clearTimeout(temporizador);
            caja.remove();
            acomodarCuadros();
            guardar(CLAVE_CERRADO, '1');
        });

        actualizarFlechas();
        mostrar(0);
    }
});
