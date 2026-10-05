// --- PROMOCIONES: muestra las publicaciones de datos/promociones.json ---
// El archivo se edita sin código desde el panel /admin (Decap CMS).
// Solo se muestran las publicaciones marcadas como "Publicada" y que no hayan vencido.
// Las fotos y videos conservan su forma original: horizontales o verticales.
document.addEventListener('DOMContentLoaded', async () => {
    const galeria = document.querySelector('[data-galeria]');
    const vacio = document.querySelector('[data-sin-publicaciones]');
    if (!galeria) return;

    const EXT_VIDEO = /\.(mp4|webm|m4v|mov)$/i;

    function fechaLegible(texto) {
        const [anio, mes, dia] = texto.split('-');
        return `${dia}/${mes}/${anio}`;
    }

    // El panel guarda rutas como "/Images/promociones/foto.jpg". Se usan relativas a la página
    // ("Images/...") para que funcionen igual con npm start, en Netlify y en la vista previa de VS Code.
    // Las direcciones completas (https://...) se dejan como están.
    function rutaArchivo(ruta) {
        return /^\/(?!\/)/.test(ruta) ? ruta.slice(1) : ruta;
    }

    function crearMedio(publicacion) {
        if (EXT_VIDEO.test(publicacion.archivo)) {
            const video = document.createElement('video');
            // "#t=0.1" hace que se vea el primer cuadro en lugar de un recuadro negro
            video.src = rutaArchivo(publicacion.archivo) + '#t=0.1';
            video.controls = true;
            video.playsInline = true;
            video.preload = 'metadata';
            return video;
        }
        const imagen = document.createElement('img');
        imagen.src = rutaArchivo(publicacion.archivo);
        imagen.alt = publicacion.titulo || '';
        imagen.loading = 'lazy';
        return imagen;
    }

    // Se usa textContent (no innerHTML) para que ningún texto se interprete como código
    function crearTarjeta(publicacion) {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'publicacion ventana tono-mint';

        if (publicacion.archivo) {
            const medio = document.createElement('div');
            medio.className = 'medio-publicacion';
            medio.appendChild(crearMedio(publicacion));
            tarjeta.appendChild(medio);
        }

        const cuerpo = document.createElement('div');
        cuerpo.className = 'cuerpo-publicacion';

        if (publicacion.tipo) {
            const etiqueta = document.createElement('span');
            etiqueta.className = 'etiqueta-plantilla';
            etiqueta.textContent = publicacion.tipo;
            cuerpo.appendChild(etiqueta);
        }

        const titulo = document.createElement('h2');
        titulo.textContent = publicacion.titulo || '';
        cuerpo.appendChild(titulo);

        if (publicacion.descripcion) {
            const descripcion = document.createElement('p');
            descripcion.textContent = publicacion.descripcion;
            cuerpo.appendChild(descripcion);
        }

        if (publicacion.hasta) {
            const vigencia = document.createElement('p');
            vigencia.className = 'vigencia';
            vigencia.textContent = `Válida hasta el ${fechaLegible(publicacion.hasta)}`;
            cuerpo.appendChild(vigencia);
        }

        tarjeta.appendChild(cuerpo);
        return tarjeta;
    }

    try {
        // "no-store" para ver siempre lo último publicado
        const respuesta = await fetch('datos/promociones.json', { cache: 'no-store' });
        const datos = await respuesta.json();
        const hoy = new Date().toISOString().slice(0, 10);

        const visibles = (datos.publicaciones || []).filter((p) =>
            p.publicada !== false && (!p.hasta || p.hasta.slice(0, 10) >= hoy));

        visibles.forEach((p) => galeria.appendChild(crearTarjeta(p)));
        vacio.hidden = visibles.length > 0;
    } catch (error) {
        vacio.hidden = false;
    }
});
