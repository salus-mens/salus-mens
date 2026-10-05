// --- MODO NOCTURNO: SE APLICA ANTES DE DIBUJAR LA PÁGINA ---
// Se carga sin "defer" en el <head> para evitar el destello blanco al abrir cada página.
// Usa el tema guardado por el visitante o, si no eligió ninguno, el de su sistema.
(function () {
    let tema = null;
    try {
        tema = localStorage.getItem('tema');
    } catch (error) {
        // Navegación privada o almacenamiento bloqueado: se usa el tema del sistema
    }
    if (tema !== 'dark' && tema !== 'light') {
        tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', tema);
})();
