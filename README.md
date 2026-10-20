# JurisConecta

Portal chileno para conectar personas con abogados verificados.

- Sitio oficial: [jurisconecta.cl](https://jurisconecta.cl)
- Aplicación: [`portal-abogados/`](portal-abogados/)
- Estado técnico, rutas de prueba y cronograma: [`portal-abogados/README.md`](portal-abogados/README.md)

La producción se sirve desde el Worker de Cloudflare `jurisconecta`, enlazado exclusivamente con recursos de JurisConecta. La rama activa es `codex/mvp-inicial`.

El acceso administrativo mediante GitHub OAuth está configurado y verificado en el dominio oficial.

Actualización del **13 de octubre de 2026**: portada sin la tarjeta retirada, carrusel de colaboraciones administrable y planes con créditos de período/reserva, historial y reglas configurables. Producción permanece en **modo gratuito**, sin pasarela de pago. Detalles, pruebas y pendientes en [el informe de la actualización](portal-abogados/docs/PLANES-CREDITOS-ALIADOS-2026-10-13.md).

Actualización del **15 de octubre de 2026**: roles exclusivos por correo y cambio administrativo seguro; 78 tipos de caso, home de 18 tarjetas (3 × 6 en escritorio), formularios editables y borrador privado antes de registrarse. La verificación disponible al final es Google, sin envío de códigos de correo ni servicios pagados. [Informe y ruta de pruebas](portal-abogados/docs/ROLES-CATALOGO-SOLICITUDES-2026-10-15.md).

Actualización del **19 de octubre de 2026**: soporte con historial paginado, búsqueda/filtros, responsables, prioridades, notas internas, avisos al equipo y métricas; editor administrativo de **12 plantillas de correo**, con borradores, versiones y vista previa **sin envío real**; ejemplos ficticios y fuentes oficiales para los **78 formularios**, con revisión jurídica humana pendiente. [Alcance, pruebas y estado de despliegue](portal-abogados/docs/SOPORTE-CORREOS-FORMULARIOS-2026-10-19.md). No se activaron servicios de pago ni se modificó Chile3X.
