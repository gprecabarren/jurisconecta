# JurisConecta

![Identidad oficial de JurisConecta](portal-abogados/public/brand/logo-email.png)

Portal chileno para conectar personas con abogados verificados.

- Sitio oficial: [jurisconecta.cl](https://jurisconecta.cl)
- Aplicación: [`portal-abogados/`](portal-abogados/)
- Estado técnico, rutas de prueba y cronograma: [`portal-abogados/README.md`](portal-abogados/README.md)

La producción se sirve desde el Worker de Cloudflare `jurisconecta`, enlazado exclusivamente con recursos de JurisConecta. La rama activa es `codex/mvp-inicial`.

El acceso administrativo mediante GitHub OAuth está configurado y verificado en el dominio oficial.

Actualización del **13 de octubre de 2026**: portada sin la tarjeta retirada, carrusel de colaboraciones administrable y planes con créditos de período/reserva, historial y reglas configurables. Producción permanece en **modo gratuito**, sin pasarela de pago. Detalles, pruebas y pendientes en [el informe de la actualización](portal-abogados/docs/PLANES-CREDITOS-ALIADOS-2026-10-13.md).

Actualización del **15 de octubre de 2026**: roles exclusivos por correo y cambio administrativo seguro; 78 tipos de caso, home de 18 tarjetas (3 × 6 en escritorio), formularios editables y borrador privado antes de registrarse. La verificación disponible al final es Google, sin envío de códigos de correo ni servicios pagados. [Informe y ruta de pruebas](portal-abogados/docs/ROLES-CATALOGO-SOLICITUDES-2026-10-15.md).

Actualización del **19 de octubre de 2026**: soporte con historial paginado, búsqueda/filtros, responsables, prioridades, notas internas, avisos al equipo y métricas; editor administrativo de **12 plantillas de correo**, con borradores, versiones y vista previa **sin envío real**; ejemplos ficticios y fuentes oficiales para los **78 formularios**, con revisión jurídica humana pendiente. [Alcance, pruebas y estado de despliegue](portal-abogados/docs/SOPORTE-CORREOS-FORMULARIOS-2026-10-19.md). No se activaron servicios de pago ni se modificó Chile3X.

Entrega desplegada y verificada: Worker `b11f2c94-e260-432e-9f40-3751fc0eedb6`, [commit de implementación `62f1a1a`](https://github.com/gprecabarren/jurisconecta/commit/62f1a1a). Pasan 92 pruebas; migraciones 0019/0020 aplicadas solo a JurisConecta, conservando cuentas/casos/créditos y modo gratuito. El informe incluye la ruta de testeo y los pendientes antes de un piloto real.

Actualización del **20 de octubre de 2026**: identidad oficial negro tinta/oro mate aplicada en sitio público, paneles, accesos, mantenimiento, favicon/iconos, imagen social, noticias y correos. Se retiró la marca genérica; se conservan los SVG oficiales, sus máscaras y proporciones. Pasan **101 pruebas**. [Informe de identidad y despliegue](portal-abogados/docs/IDENTIDAD-OFICIAL-2026-10-20.md). Sin migraciones, cambios económicos ni modificaciones de Chile3X.

Publicado y verificado: Worker `264759f3-5b9c-45c3-a387-c342410b4515`, [código `d357fcc`](https://github.com/gprecabarren/jurisconecta/commit/d357fcc), 22 comprobaciones HTTP sin fallos. Las plantillas mantienen los envíos deshabilitados.

Ajuste visual posterior del **20 de octubre**: redes sociales en una segunda fila del header fijo de escritorio, manteniendo el menú móvil; se retiró la raya vertical decorativa del inicio y se ajustó el espacio de las anclas. **103 pruebas aprobadas**, sin cambios de datos ni servicios. [Detalle y evidencia](portal-abogados/docs/IDENTIDAD-OFICIAL-2026-10-20.md#ajuste-posterior-del-header).

Versión actual de este ajuste: `9e5105ff-e1f1-4c01-925e-70b80a2d7f7a`, [código `45e09f1`](https://github.com/gprecabarren/jurisconecta/commit/45e09f1). Inicio, noticias, guía, soporte, login y salud verificados; Chrome confirmó posición de RRSS y eliminación de la raya.
