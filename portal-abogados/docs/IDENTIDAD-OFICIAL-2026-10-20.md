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
- [Portada escritorio, demo local](proofs/identidad-home-desktop-20261020.jpg), [móvil, demo local](proofs/identidad-home-movil-20261020.jpg), [panel administrativo ficticio](proofs/identidad-admin-demo-20261020.jpg).

## Publicación

Pendiente de completar tras desplegar y comprobar el dominio oficial. El destino es exclusivamente Worker `jurisconecta`, dominios `jurisconecta.cl` / `www.jurisconecta.cl`; no se requieren migraciones D1.

## Siguiente revisión

Comprobar la nueva miniatura al volver a compartir un enlace, porque WhatsApp/Facebook/LinkedIn pueden conservar caché propia. Revisar la pantalla de inicio en un iPhone físico y los tonos en distintos monitores. Los pendientes funcionales y jurídicos anteriores siguen en [el informe del 19 de octubre](SOPORTE-CORREOS-FORMULARIOS-2026-10-19.md); este cambio de identidad no los da por resueltos.
