# Botones, movimiento y espaciado — 23 de octubre de 2026

## Alcance

Se revisaron en modo lectura los proyectos locales del propietario **Kuchitril** y **Hostal Piffre**, además de sus portadas públicas en Chrome. Se adaptaron las cápsulas y flechas de Kuchitril y el movimiento editorial sobrio de Piffre a la identidad oficial negro tinta/oro de JurisConecta. No se copiaron marcas, textos, la intro bloqueante, parallax ni dependencias de animación de esos sitios. Ninguno de los proyectos de referencia ni Chile3X se modificó.

- CTA principal: cápsula de 54 px mínimos, separación entre texto/flecha, oro mate, elevación de 3 px y sombra discreta con mouse; respuesta al pulsar y foco visible de teclado.
- Acciones secundarias: relleno de oro progresivo, texto oscuro legible y flecha desplazada; el contador de «Ver más casos» hereda el color correcto del botón.
- Formularios, planes/créditos, tickets, correos, catálogo y carrusel: nueve CSS Modules armonizados. Pestañas y herramientas de edición mantienen posición estable; botones de solo icono siguen compactos. Google conserva su identidad blanca y las acciones destructivas siguen rojas.
- `:disabled`, `fieldset:disabled`, `aria-disabled` y acciones ocupadas conservan señales propias. La nueva animación de hover requiere puntero fino, no un estado táctil persistente. No se modifican controladores de envío, permisos ni validaciones.
- Espaciado: más aire entre descripción y catálogo (26–36 px), listas del inicio con mayor separación y texto de tarjetas a interlineado 1,55. Los CTA largos pueden partir en líneas sin exceder su contenedor. Se mantiene Manrope y la jerarquía tipográfica existente.

## Movimiento progresivo y accesibilidad

El revelado usa observadores nativos, sin GSAP ni paquetes nuevos: 760 ms con curva `cubic-bezier(.2,.8,.2,1)`, recorridos de 30 px (20 px/650 ms en móvil) y escalonado de hasta 180 ms. Mantiene las entradas laterales del home. Catálogo y colaboraciones también participan, incluso si llegan después de una petición.

El HTML está visible por defecto, sin depender de JavaScript para leerlo. Hero, logo y contenido inicialmente visible no desaparecen durante la hidratación. El controlador revela una sola vez, descubre nodos nuevos, libera nodos retirados, limpia observadores/listeners al cambiar de ruta y falla abierto si la observación no está disponible. El foco de teclado revela inmediatamente su bloque. Si el dispositivo activa movimiento reducido, el contenido se muestra y se quitan desplazamientos, demoras y scroll suave, también con un cambio de preferencia en vivo.

La revisión React mantuvo efectos con cleanup, clases para los cambios visuales y ausencia de listeners de scroll por frame. No cambia la carga de datos ni añade servicios externos.

## Verificación

- **116/116 pruebas**, TypeScript, ESLint y build de **35 rutas** correctos; despliegue en seco validado. Se añaden nueve pruebas del controlador y cuatro contratos de interacción/espaciado. El paquete del Worker no cambia: 774,65 KiB / 178,69 KiB gzip, 406 archivos estáticos.
- Chrome local: anchos solicitados de **320, 375, 390, 768, 1180, 1181 y 1440 px**. El área útil fue 15 px menor por la barra de scroll. Portada y editor de correos sin overflow horizontal ni recortes de texto en botones visibles.
- Botón principal: 54 px, radio 999 px, transición de 250 ms; hover comprobado con elevación de 3 px y flecha `(3,-3)`.
- Botón secundario relleno: contador y texto del mismo color oscuro, con fondo oro. Botón de guardar deshabilitado: sin transformación ni sombra aunque se fuerce hover.
- Movimiento reducido en vivo: cero bloques pendientes/ilegibles, transiciones a 0 s y scroll automático. Navegación por teclado a la primera tarjeta: foco visible y catálogo mostrado inmediatamente.
- Menú móvil: nueve enlaces, sin overflow, cierre con Escape. Se conserva el header fijo con RRSS debajo de «Cómo funciona» en escritorio. No equivale a probar cada dispositivo físico ni a una prueba real en Safari/iPhone.
- Se mantienen títulos, encabezados, enlaces, canonicals, robots y metadatos SEO; no se añaden páginas públicas de prueba.

Evidencias de la misma compilación en una **demo local con datos ficticios**: [escritorio](proofs/botones-home-desktop-20261023.jpg), [móvil](proofs/botones-home-movil-20261023.jpg), [catálogo](proofs/botones-catalogo-20261023.jpg).

## Publicación

Publicado el **23 de octubre** en el Worker `jurisconecta`, versión **`87d375d1-06f5-4551-9cd5-c3b85328099a`**, código [`889bee1`](https://github.com/gprecabarren/jurisconecta/commit/889bee1); startup 15 ms. Inicio, acceso, registro, noticias, soporte y salud responden 200. Los dos CSS de la portada responden 200 y coinciden exactamente con el build.

Chrome de producción confirmó CTA de 54 px/radio 999 px, texto adaptable, duración de revelado de 760 ms, separación de catálogo de 36 px, hero visible y ausencia de overflow. La captura de producción agotó su tiempo de espera; las evidencias enlazadas son locales y están identificadas como tales.

El despliegue se limita al Worker existente y sus dominios oficiales. No se ejecutaron migraciones ni escrituras de prueba en producción; no se activaron planes, pagos, correos, almacenamiento ni productos nuevos. Los pendientes funcionales/jurídicos del [informe del 19 de octubre](SOPORTE-CORREOS-FORMULARIOS-2026-10-19.md) siguen pendientes: este ajuste visual no los resuelve.
