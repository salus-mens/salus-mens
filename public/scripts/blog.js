// --- BLOG: muestra los artículos de datos/blog.json ---
// Los artículos se crean y editan sin código desde el panel /admin (sección "Blog").
// - Se muestran del más reciente al más antiguo; solo los marcados como "Publicado".
// - Filtros por categoría.
// - Cada artículo tiene su propio enlace (blog.html#titulo-del-articulo) para compartirlo en redes:
//   al abrirlo, el artículo aparece desplegado.
// - El contenido usa formato simple (Markdown): negritas, cursivas, subtítulos, listas y enlaces.
document.addEventListener('DOMContentLoaded', async () => {
    const lista = document.querySelector('[data-blog]');
    const filtros = document.querySelector('[data-blog-filtros]');
    const vacio = document.querySelector('[data-blog-vacio]');
    if (!lista) return;

    const TONOS = ['tono-mint', 'tono-aqua', 'tono-seafoam', 'tono-pastel'];
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    // Las rutas del panel ("/Images/...") se usan relativas a la página (ver promo-flotante.js)
    function rutaArchivo(ruta) {
        return /^\/(?!\/)/.test(ruta) ? ruta.slice(1) : ruta;
    }

    function fechaLegible(texto) {
        const [anio, mes, dia] = (texto || '').slice(0, 10).split('-').map(Number);
        return anio ? `${dia} de ${MESES[mes - 1]} de ${anio}` : '';
    }

    function identificador(titulo) {
        return (titulo || 'articulo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    }

    // --- Markdown simple y seguro: primero se escapa todo el HTML, luego se aplica el formato ---
    function escapar(texto) {
        return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function enLinea(texto) {
        return escapar(texto)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
            // Solo enlaces web o de correo; se abren en otra pestaña
            .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }

    function markdown(texto) {
        const bloques = (texto || '').replace(/\r/g, '').split(/\n{2,}/);
        return bloques.map((bloque) => {
            const lineas = bloque.split('\n').filter((l) => l.trim());
            if (!lineas.length) return '';
            if (lineas.every((l) => /^\s*[-*•]\s+/.test(l))) {
                return '<ul>' + lineas.map((l) => `<li>${enLinea(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
            }
            if (lineas.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
                return '<ol>' + lineas.map((l) => `<li>${enLinea(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
            }
            const titulo = lineas[0].match(/^(#{1,4})\s+(.*)$/);
            if (titulo && lineas.length === 1) return `<h3>${enLinea(titulo[2])}</h3>`;
            return `<p>${lineas.map(enLinea).join('<br>')}</p>`;
        }).join('');
    }

    function crearArticulo(a, i) {
        const art = document.createElement('article');
        art.className = `articulo ventana ${TONOS[i % TONOS.length]}`;
        art.id = a.id;

        if (a.imagen) {
            const img = document.createElement('img');
            img.className = 'articulo-imagen';
            img.src = rutaArchivo(a.imagen);
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', () => img.remove());
            art.appendChild(img);
        }

        const etiqueta = document.createElement('span');
        etiqueta.className = 'etiqueta';
        etiqueta.textContent = (a.categoria || 'Blog').toUpperCase();

        const titulo = document.createElement('h2');
        titulo.textContent = a.titulo || '';

        const meta = document.createElement('p');
        meta.className = 'articulo-meta';
        meta.textContent = [fechaLegible(a.fecha), a.autor].filter(Boolean).join(' · ');

        const resumen = document.createElement('p');
        resumen.textContent = a.resumen || '';

        art.append(etiqueta, titulo, meta, resumen);

        if (a.contenido) {
            const detalles = document.createElement('details');
            const resumenBoton = document.createElement('summary');
            resumenBoton.textContent = 'Leer más';
            const cuerpo = document.createElement('div');
            cuerpo.className = 'articulo-contenido';
            cuerpo.innerHTML = markdown(a.contenido); // seguro: markdown() escapa todo el HTML

            const compartir = document.createElement('button');
            compartir.type = 'button';
            compartir.className = 'enlace-texto articulo-compartir';
            compartir.textContent = 'Copiar enlace del artículo';
            compartir.addEventListener('click', async () => {
                const enlace = location.href.split('#')[0] + '#' + a.id;
                try {
                    if (navigator.share) await navigator.share({ title: a.titulo, url: enlace });
                    else { await navigator.clipboard.writeText(enlace); compartir.textContent = '¡Enlace copiado!'; }
                } catch (error) { /* el visitante canceló */ }
            });

            detalles.append(resumenBoton, cuerpo, compartir);
            detalles.addEventListener('toggle', () => {
                resumenBoton.textContent = detalles.open ? 'Leer menos' : 'Leer más';
            });
            art.appendChild(detalles);
        }
        return art;
    }

    let articulos = [];
    try {
        const respuesta = await fetch('datos/blog.json', { cache: 'no-store' });
        const datos = await respuesta.json();
        articulos = (datos.articulos || [])
            .filter((a) => a.publicada !== false && a.titulo)
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    } catch (error) {
        articulos = [];
    }

    // Identificadores únicos para los enlaces
    const usados = new Set();
    articulos.forEach((a) => {
        let id = identificador(a.titulo), n = 2;
        while (usados.has(id)) id = `${identificador(a.titulo)}-${n++}`;
        usados.add(id);
        a.id = id;
    });

    function pintar(categoria) {
        lista.innerHTML = '';
        const visibles = articulos.filter((a) => !categoria || a.categoria === categoria);
        visibles.forEach((a, i) => lista.appendChild(crearArticulo(a, i)));
        vacio.hidden = visibles.length > 0;
    }

    // --- Filtros por categoría (solo si hay más de una) ---
    const categorias = [...new Set(articulos.map((a) => a.categoria).filter(Boolean))];
    if (filtros && categorias.length > 1) {
        ['Todas', ...categorias].forEach((nombre, i) => {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'filtro-blog';
            boton.textContent = nombre;
            boton.setAttribute('aria-pressed', String(i === 0));
            boton.addEventListener('click', () => {
                filtros.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
                pintar(i === 0 ? '' : nombre);
            });
            filtros.appendChild(boton);
        });
        filtros.hidden = false;
    }

    pintar('');

    // --- Enlace directo a un artículo (blog.html#titulo) ---
    function abrirDesdeEnlace() {
        const id = decodeURIComponent(location.hash.slice(1));
        const art = id && document.getElementById(id);
        if (!art || !art.classList.contains('articulo')) return;
        const detalles = art.querySelector('details');
        if (detalles) detalles.open = true;
        art.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener('hashchange', abrirDesdeEnlace);
    abrirDesdeEnlace();
});
