# Verificación de JurisConecta — 8 de octubre de 2026

## Alcance

Solo repositorio JurisConecta, Worker `jurisconecta` y D1 `jurisconecta-db`. Google se configuró con **jurisconecta.site@gmail.com**. Chile3X no se modificó. No se activaron planes, pruebas pagadas, facturación Google Cloud ni un almacenamiento nuevo.

## Resultado comprobado

| Comprobación | Evidencia / límite |
| --- | --- |
| Tipos, lint y compilación | `pnpm check` pasa; 32 rutas estáticas. Tipos Wrangler vigentes. |
| Pruebas automatizadas | `pnpm test`: 11/11 pasan. SQLite en memoria, las 12 migraciones, sin tocar producción. |
| Despliegue | Versión `623884f8-0d4c-46f9-acca-cc3cbc402593`; dominios jurisconecta.cl y www. Arranque Worker informado: 15 ms. No es una medición de carga del navegador. |
| SEO público | 8 URLs del sitemap con HTTP 200, una H1 y una metadescripción; canónicas propias. RSS 200. www redirige al dominio principal. |
| Noticias | Cuatro guías publicadas. Editor carga su contenido y SEO. Guardado de la primera guía confirmado por interfaz y bitácora `news.update` del administrador. |
| Controles de editor | Autorización, CSRF, contenido sanitizado, URL/imagen, versión y auditoría atómica cubiertos en pruebas. API sin sesión devuelve 401; noticia desconocida 404. |
| Google OAuth real | Selección de la cuenta oficial, intercambio de código y retorno correcto para login sin identidad registrada y formularios pendientes de cliente/abogado. No se completó una cuenta real para la prueba. |
| Registro Google local | Términos obligatorios, rol de servidor, abogado pendiente, consumo de un solo uso, expiración y rechazo de callback inválido. |
| Tag Manager | Importación permitió publicar v2 del contenedor GTM-PR9DGQR2: 3 etiquetas, 2 activadores, 4 variables. |
| Analytics | G-JT82FBN1S8 recibió visitas y eventos de intención; en tiempo real se comprobaron `register_start` y `login_open`. No representan cuentas creadas. |
| Consentimiento | Antes de aceptar y al rechazar no cargan GTM/GA. Después de aceptar se verificó `page_view` público. Tras revocar y recargar: cero scripts Google en el documento. Sin medición en rutas privadas. |
| Móvil | Noticias a 390 × 844: documento y ancho desplazable 390 px, grilla de una columna; header fijo con acceso/registro y controles de consentimiento legibles. Se restauró la emulación al terminar. |
| Soporte | Correo oficial guardado desde administración y reflejado en header/footer; bitácora `content.publish`. No envía emails automáticamente. |
| Mantenimiento | Desactivado en producción. Prueba local: bloquea público y conserva protección/acceso admin. |
| Search Console | Dominio verificado, sitemap enviado/reenviado, acceso en vivo correcto. Solicitud de indexación del inicio aceptada. Seguridad y acciones manuales sin problemas detectados. |

## Pendientes que no se presentan como terminados

- **Sitemap:** el informe de Google seguía mostrando «No se ha podido obtener» y cero URLs descubiertas, aunque su comprobación en vivo fue correcta. Revisar el siguiente procesamiento y, si persiste, diagnosticar rastreo/reglas sin debilitar seguridad. No hay evidencia de indexación completada.
- **Semrush:** proyecto 31520982 visible, pero los controles de Chrome no respondieron de manera fiable. Cuenta propietaria, auditoría y seguimiento no verificados. No configurar con otro correo ni activar pruebas/planes para continuar.
- **Prueba de negocio completa:** aún se debe repetir con cuentas ficticias el recorrido caso → propuestas → aceptación → contacto → cierre → evaluación, tickets y eliminación. Las comprobaciones de este cambio no son una certificación de todos los módulos históricos.
- **Lanzamiento:** términos/privacidad/editorial necesitan revisión jurídica; antispam del acceso por contraseña, moderación, limpieza autorizada de datos demostrativos, revisión de seguridad y ensayo de restauración pendientes. El seguimiento es de plataforma, no judicial; mensajes dentro de causa, hitos del abogado y adjuntos seguros aún faltan.
- **Costos:** no se aceptó ningún pago en este trabajo. Vigilar cuotas y servicios preexistentes de la cuenta; no es posible garantizar una factura global de cero solo desde el código.

## Evidencias visuales

- [Tag Manager publicado](proofs/gtm-publicado-2026-10-08.png).
- [Analytics vinculado con Search Console](proofs/analytics-search-console-2026-10-08.png).
- [Analytics en tiempo real](proofs/analytics-tiempo-real-2026-10-08.png).
- [Sitemap accesible para Google](proofs/google-sitemap-accesible-2026-10-08.png).
- [Indexación del inicio solicitada](proofs/google-indexacion-solicitada-2026-10-08.png).
- [Noticias en escritorio](proofs/noticias-escritorio-2026-10-08.png).
- [Noticias en móvil](proofs/noticias-movil-2026-10-08.png).
- [Editor administrativo](proofs/editor-noticias-2026-10-08.png).

La ruta manual detallada y el cronograma del **8 al 29 de octubre** están en [README](../README.md). Objetivo: piloto cerrado en unas tres semanas, condicionado a revisión legal, incidencias y pruebas, no lanzamiento comercial garantizado.
