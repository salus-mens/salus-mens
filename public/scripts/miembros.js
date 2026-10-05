// --- ÁREA EXCLUSIVA (Mi espacio) ---
// Muestra el nombre del usuario que inició sesión. Las páginas ya están protegidas por el servidor;
// si la sesión venció mientras la página estaba abierta, se vuelve al inicio de sesión.
document.addEventListener('DOMContentLoaded', async () => {
    const nombre = document.querySelector('[data-nombre-usuario]');
    try {
        const respuesta = await fetch('/api/sesion');
        if (respuesta.status === 401) {
            location.href = '/login.html';
            return;
        }
        const datos = await respuesta.json();
        if (nombre && datos.nombre) nombre.textContent = datos.nombre;
    } catch (error) {
        // Sin conexión: se deja el saludo genérico
    }
});
