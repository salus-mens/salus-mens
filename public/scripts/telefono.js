// --- SELECTOR DE PAÍS PARA EL CELULAR ---
// Llena cada <select data-paises> con todos los países y su código (+593, +34, ...),
// con los nombres en español y el país de data-defecto preseleccionado.
// La validación del número la hace formularios.js con libphonenumber (vendor/libphonenumber).
document.addEventListener('DOMContentLoaded', () => {
    const lib = window.libphonenumber;
    const selects = document.querySelectorAll('select[data-paises]');
    if (!lib || !selects.length) return;

    let nombres = null;
    try {
        nombres = new Intl.DisplayNames(['es'], { type: 'region' });
    } catch (error) {
        // Navegador antiguo: se muestran los códigos de país (EC, ES, ...)
    }

    const paises = lib.getCountries()
        .map((codigo) => ({
            codigo,
            nombre: (nombres && nombres.of(codigo)) || codigo,
            prefijo: '+' + lib.getCountryCallingCode(codigo)
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    selects.forEach((select) => {
        const defecto = select.dataset.defecto || select.value || 'EC';
        select.innerHTML = '';
        paises.forEach(({ codigo, nombre, prefijo }) => {
            // El prefijo va primero para que se vea aunque el nombre se recorte
            select.add(new Option(`${prefijo} ${nombre}`, codigo, false, codigo === defecto));
        });
    });
});
