// --- CHAT GNOSIS (asistente virtual de Salus Mens) ---
// Carga el chat que funciona en el servidor de Gnosis (proyecto X:\ChatBoot).
// - SERVIDOR: ruta del chat en este sitio (ver netlify.toml, regla /gnosis/*).
// - Si SERVIDOR está vacío, el chat no aparece (la página funciona igual).
// - Posición (esquina inferior derecha):
//     · el botón del chat queda por encima del sello «Powered by Netlify»;
//     · el cuadro flotante de promociones sube por encima del botón del chat.
//   El cuadro de redes sociales (izquierda) no cambia.
(function () {
    // El chat se pide a este mismo sitio (/gnosis); Netlify lo reenvía al servidor de Gnosis.
    // Así el navegador no se conecta a direcciones de la red local (Chrome pedía permiso para eso).
    var SERVIDOR = location.origin + '/gnosis';
    var DISTANCIA_ABAJO = 72; // px: deja libre el sello de Netlify

    if (!SERVIDOR) return;

    var estilo = document.createElement('style');
    estilo.textContent = '.promo-flotante:not(.flotante-izquierda){bottom:' + (DISTANCIA_ABAJO + 74) + 'px}';
    document.head.appendChild(estilo);

    var script = document.createElement('script');
    script.src = SERVIDOR + '/widget.js';
    script.defer = true;
    script.setAttribute('data-servidor', SERVIDOR);
    script.setAttribute('data-color', '#2C4A41');
    script.setAttribute('data-abajo', String(DISTANCIA_ABAJO));
    document.body.appendChild(script);
})();
