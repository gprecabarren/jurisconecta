# Identidad oficial de JurisConecta — 20 de octubre de 2026

## Identidad aplicada

Principal: **negro tinta `#111617`, oro mate `#D8BD83`, texto cálido `#E4DED0`**. El champán `#E3CCA0` se reserva para acentos claros. Se mantiene Manrope en la interfaz; las letras del logo son curvas del SVG oficial y no dependen de Garamond, Segoe UI ni fuentes del visitante.

Fuentes originales entregadas por el propietario: `Juris-Conecta-entrega-final.zip`, `Juris-Conecta-propuestas-finales.pdf` y SVG principal/alternativo. Los originales de Downloads no se modificaron. La alternativa no reemplaza a la principal. Se conservaron máscaras de luminancia, trazados, transparencia, proporciones y espacios del arte aprobado, sin filtros ni redibujos.

## Cobertura

| Superficie | Aplicación |
| --- | --- |
| Header público y menú móvil | Firma compacta oficial, con enlace accesible a inicio |
| Portada | Figura vertical completa junto al contenido, con adaptación móvil |
| Footer público | Composición horizontal oficial, carga diferida |
| Login y registro | Firma oficial; incluye el registro compartido por las demostraciones administrativas |
| Paneles cliente, abogado y administrador | Firma oficial en navegación; sidebar desplazable preservado |
| Mantenimiento | Logo vertical; solo se comprobó localmente, no se activó mantenimiento real |
| Noticias y guías | Header/footer compartidos actualizados, portada predeterminada renovada y logo oficial del publisher en JSON-LD |
| Redes y enlaces compartidos | PNG de 1200 × 630 con el arte oficial; Open Graph y Twitter usan versión `20261020` |
| Navegador | SVG/ICO, PNG de 32 y 48 px; `icon.svg` de Next usa el mismo monograma J oficial |
| Pantalla de inicio móvil | Apple Touch 180 px, iconos 192/512 px y manifest con nombre/colores oficiales |
| Correos | 12 ejemplos y renderizado de plantillas anteriores con encabezado oficial; sin alterar borradores/publicaciones guardados |

El manifest no incorpora un service worker ni promete funcionamiento sin conexión o notificaciones push. El favicon oficial es el monograma auxiliar J de la entrega, no una reducción ilegible de la figura completa.

Se retiró la balanza genérica que se usaba como marca. Se eliminaron los cinco SVG de plantilla sin consumidores (`next`, `vercel`, `file`, `globe`, `window`), recuperables en el historial Git. Los iconos funcionales de materias legales y el icono oficial de Google no son logos de JurisConecta y se conservaron. Las capturas e informes históricos siguen siendo evidencia de entregas anteriores y no se reescribieron.

## Implementación y seguridad

- `shared/brand.ts` centraliza colores, rutas y dimensiones; `BrandLogo` reutiliza los SVG externos con `width`/`height`, texto alternativo, `decoding="async"` y carga según contexto. Sin librería de iconos para recrear la marca ni peticiones de fuentes para el logo.
- Paleta carbón/oro en el CSS global y nueve módulos; tarjetas, formularios, foco y scroll se mantienen. Los estados de éxito/error y los fondos neutros necesarios para leer contenido no se recolorean indiscriminadamente.
- `/og-jurisconecta.png` conserva su ruta histórica para las portadas predeterminadas ya guardadas, pero cambia su contenido. Los metadatos sociales usan un parámetro de versión para facilitar actualización de cachés. Servicios externos pueden conservar una previsualización anterior hasta volver a rastrear el enlace.
- Mantenimiento permite únicamente las rutas concretas de identidad necesarias; no abre `/brand/*` indiscriminadamente ni cambia permisos de páginas/API privadas.
- El HTML de correos solo admite la imagen fija `https://jurisconecta.cl/brand/logo-email.png`, sin parámetros, fragmentos, recursos arbitrarios ni píxeles de seguimiento. Sus atributos son reconstruidos por el servidor. La vista previa permite exclusivamente esa imagen y conserva sandbox, bloqueo de scripts/conexiones y sanitización. Las plantillas anteriores reciben encabezado al renderizar si falta, sin modificar D1.
- **No se activan envíos de correo, pagos ni productos nuevos.** No hay migraciones ni cambios de cuentas, casos, roles, créditos, noticias guardadas o configuración económica. Chile3X no se modificó.

## Reproducibilidad

Los assets finales están versionados y el build normal no necesita herramientas gráficas nuevas. Para reimportar exclusivamente los recursos seleccionados desde la entrega original:

```powershell
./tools/import-brand.ps1 -SourceZip 'C:\ruta\Juris-Conecta-entrega-final.zip'
```

`tools/build-brand-images.mjs` genera únicamente el PNG de correo de 670 × 200 y la tarjeta social de 1200 × 630 a partir del PNG oficial, sin recrear la figura. Requiere `sharp` disponible localmente o la variable `JURIS_BRAND_SHARP_MODULE` apuntando al módulo del runtime de trabajo; no se añadió dependencia de producción. No ejecutar el importador ni el generador desde el Worker. Si cambia el favicon de la entrega, actualizar también `src/app/icon.svg` mediante edición revisada; una prueba comprueba que coincida con `public/favicon.svg`.

## Verificación

- **101/101 pruebas**, TypeScript, ESLint y build de 35 rutas correctos; tipos Wrangler comprobados y despliegue en seco correcto. Paquete Worker: 774,65 KiB / 178,69 KiB gzip, 406 archivos estáticos.
- Siete pruebas de marca: máscaras y trazados, recursos autónomos sin código activo, render/accesibilidad/dimensiones de componentes, reemplazo de superficies, PNG/ICO/manifest y mantenimiento con autenticación conservada. Dos pruebas adicionales de correo comprueban imagen fija y preservación de contenido anterior.
- Chrome local: escritorio de 1521 px útiles, viewports 390 × 844 y 320 × 740 sin overflow horizontal; header/firma y figura SVG cargados. Login con campos de 16 px, menú móvil de nueve enlaces, sidebar con scroll y mantenimiento revisados. No equivale a prueba física en Safari/iPhone.
- [Portada escritorio, demo local](proofs/identidad-home-desktop-20261020.jpg), [móvil, demo local](proofs/identidad-home-movil-20261020.jpg), [panel administrativo ficticio](proofs/identidad-admin-demo-20261020.jpg) y [correo ficticio con logo oficial](proofs/identidad-correo-demo-20261020.jpg). La imagen del correo cargó desde el dominio oficial (670 × 200), dentro del iframe aislado, sin errores de consola observados ni envío de mensajes.

## Publicación

Desplegado el **20 de octubre, aproximadamente a las 19:30 de Santiago**. Worker `jurisconecta`, versión **`264759f3-5b9c-45c3-a387-c342410b4515`**, únicamente dominios `jurisconecta.cl` / `www.jurisconecta.cl`; startup del despliegue: 15 ms. Código en GitHub: [`d357fcc`](https://github.com/gprecabarren/jurisconecta/commit/d357fcc). El commit documental que contiene este cierre registra la verificación posterior. No se ejecutaron migraciones ni escrituras de prueba en D1 remota.

**22 comprobaciones HTTP, cero fallos:** los 13 recursos probados de marca/favicon/iconos/manifest/imagen social devuelven 200, tipo correcto y bytes idénticos a sus archivos locales. Inicio, login, registro, noticias y una guía publicada muestran firma oficial y metadatos sociales nuevos; la guía usa el logo oficial en su publisher JSON-LD. Salud devuelve 200; la API administrativa sin sesión devuelve 401 y las páginas admin/cliente redirigen al acceso correspondiente.

Chrome confirmó la figura SVG cargada en la portada oficial y se dejó esa pestaña abierta para revisar. No se pudo guardar captura de producción por un fallo del mecanismo de captura; las evidencias adjuntas son de la misma versión en demo local, claramente identificadas. Los tres SVG de web coinciden por SHA-256 con el ZIP original. El logo previo y los residuos eliminados son recuperables en el historial Git, sin tocar los originales del propietario.

## Ajuste posterior del header

Petición posterior del propietario: RRSS debajo de la primera fila del header en PC y retirar la raya del inicio. Se separó un bloque de redes de escritorio del bloque de accesos, reutilizando los mismos enlaces configurados en administración. Desde 1181 px aparece debajo de la navegación/accesos, alineado a la derecha; el logo conserva sus proporciones y el conjunto sigue sticky. En tablet/móvil se mantiene la distribución anterior y las redes del menú. Footer y datos de enlaces no cambian.

Se retiraron ambas reglas `.hero::after` que generaban el trazo vertical. Se conservó el degradado `::before`. Las anclas del inicio tienen margen superior de 136 px en escritorio para no quedar tapadas por el header (aproximadamente 106 px en la revisión).

Validación: **103/103 pruebas**, TypeScript, ESLint, build de 35 rutas y despliegue en seco correctos. Chrome local: escritorio de 1521 px útiles y viewports solicitados de 1181, 1180, 768, 641, 640, 390 y 320 px, todos sin desbordamiento. Solo escritorio muestra la nueva fila; móvil conserva un grupo dentro del menú. Se comprobó apertura del menú y cierre al navegar a una sección. El pseudo-elemento eliminado devuelve `content: none`. [Captura del ajuste, demo local](proofs/header-rrss-desktop-20261020.jpg).

No se modifican APIs, SEO editorial, autenticación, base de datos, recursos de marca ni planes; Chile3X queda fuera del cambio. Publicado el **20 de octubre, aproximadamente a las 20:22 de Santiago**, Worker **`9e5105ff-e1f1-4c01-925e-70b80a2d7f7a`**, código [`45e09f1`](https://github.com/gprecabarren/jurisconecta/commit/45e09f1). Inicio, noticias, una guía, soporte y login responden 200 con la fila nueva y ambos grupos de redes (escritorio/menú); CSS publicado sin regla vertical y salud 200. Chrome de producción confirmó redes debajo de accesos, header sticky y `::after` sin contenido. El commit documental que contiene este cierre registra la verificación posterior. No se guardaron datos de prueba en producción.

## Corrección de alineación

Por petición posterior, las redes de escritorio se alinean ahora debajo de **«Cómo funciona»**, en lugar de debajo de los botones de acceso. Navegación y redes comparten la segunda columna del grid; la marca conserva su área clicable ajustada. No cambia el contenido, los enlaces configurados, el footer ni el menú móvil.

**103/103 pruebas**, TypeScript, ESLint, build y dry run correctos. Chrome local confirmó diferencia horizontal de **0 px** entre el primer enlace de navegación y el primer icono, tanto en escritorio normal como en el límite de 1181 px. También se revisaron viewports solicitados de 1180 y 390 px: sin fila duplicada ni desbordamiento horizontal. Se restauró el tamaño normal del navegador. [Captura de la alineación, demo local](proofs/header-rrss-como-funciona-20261020.jpg).

Publicado en Worker `jurisconecta`, versión **`4868fa01-ba6f-48bd-9be1-fb4adf2a1545`**, código [`8831bd2`](https://github.com/gprecabarren/jurisconecta/commit/8831bd2); startup 17 ms. Verificación final el **21 de octubre**: inicio, CSS y salud responden 200; el CSS remoto coincide exactamente con el build e incluye `grid-area:2/2` para redes y `grid-area:1/2` para navegación, ambos en la misma columna. Chrome abrió correctamente producción, pero la medición final se interrumpió por timeout; la evidencia geométrica y captura son locales. No se ejecutaron migraciones, escrituras de prueba ni cambios de servicios o configuración de Chile3X.

## Siguiente revisión

Comprobar la nueva miniatura al volver a compartir un enlace, porque WhatsApp/Facebook/LinkedIn pueden conservar caché propia. Revisar la pantalla de inicio en un iPhone físico y los tonos en distintos monitores. Los pendientes funcionales y jurídicos anteriores siguen en [el informe del 19 de octubre](SOPORTE-CORREOS-FORMULARIOS-2026-10-19.md); este cambio de identidad no los da por resueltos.
