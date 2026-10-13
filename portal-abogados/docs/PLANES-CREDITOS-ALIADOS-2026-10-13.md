# Entrega: planes, créditos y colaboraciones

Fecha: **13 de octubre de 2026**. Producción: [jurisconecta.cl](https://jurisconecta.cl/). Esta entrega corresponde exclusivamente al repositorio `gprecabarren/jurisconecta`, rama `codex/mvp-inicial`; no se modificó Chile3X.

## Resultado publicado

- Retirada la tarjeta completa del pantallazo: «Solicitud en pocos pasos / Tu caso merece una buena primera conversación / 3 pasos / Chile». El contenido principal ocupa una portada centrada.
- Carrusel del home con filas separadas de empresas y estudios jurídicos. Tiene flechas, desplazamiento táctil/teclado y carga diferida de imágenes; no tiene reproducción automática. Respeta movimiento reducido.
- [Administración → Empresas y estudios](https://jurisconecta.cl/admin/#colaboraciones): subir, previsualizar, editar, ordenar, activar o archivar logos con nombre, texto alternativo y enlace HTTPS opcional.
- [Planes del abogado](https://jurisconecta.cl/planes/): catálogo, suscripción y movimientos reales del saldo. Requiere abogado aprobado; la postulación utiliza el mismo catálogo administrable.
- [Administración → Planes y créditos](https://jurisconecta.cl/admin/#planes-creditos): reglas y catálogo para el propietario; otros administradores autorizados solo pueden consultar estos parámetros y saldos.

No se recibieron logos reales en esta solicitud. La tabla de producción tiene **cero colaboraciones** y el carrusel se oculta hasta activar la primera. Los nombres de prueba aparecen exclusivamente en la demo local, nunca como clientes reales en el sitio público.

## Catálogo inicial y configuración

Los parámetros iniciales se basan en el texto adjunto y en la página de planes de NexoAbogados que se leyó en la pestaña de Chrome del usuario. No se realizó ninguna suscripción allí. JurisConecta solo anuncia funciones propias existentes, sin copiar promesas de IA, WhatsApp, emails, posicionamiento garantizado ni colaboraciones comerciales ajenas.

| Plan | Créditos / 30 días | UF referencial | CLP referencial | CLP / crédito extra futuro |
| --- | ---: | ---: | ---: | ---: |
| Premium | 100 | 1,80 | 74.100 | 1.343 |
| Silver | 200 | 3,00 | 123.500 | 1.155 |
| Gold | 400 | 5,00 | 205.800 | 924 |

**En modo gratis no se cobra ninguno de estos importes.** Son referencias editables, no una conversión actualizada de UF ni una oferta de cobro. La compra de créditos extra no está habilitada.

El propietario puede editar nombre, créditos, precios UF/CLP, precio extra, descripción, beneficios, orden, estado y destacado de los tres planes. También duración del período (inicialmente 30 días), costo predeterminado de casos nuevos (5 créditos), saldo máximo (1.000.000), renovación gratuita automática, renovación anticipada y traslado de saldo al cambiar/renovar. Se valida que exista al menos un plan activo y como máximo uno destacado.

Los tres códigos técnicos y las barreras estructurales de seguridad son fijos. **Conservar la reserva al cancelar no se puede desactivar**: protege créditos ya adquiridos o asignados. Cambiar reglas no recarga retroactivamente cuentas ni cambia el precio de casos existentes; se aplica a operaciones o casos nuevos según corresponda.

## Reglas del saldo y seguridad

1. **Saldo del plan + reserva = saldo total.** La cabecera y `/planes` muestran cada componente, asignación del período y próxima renovación.
2. Se consume primero el plan y luego la reserva. El servidor y D1 exigen perfil aprobado/activo, caso compatible, propuesta aceptada, precio actual y saldo suficiente. Los clientes no pagan por publicar.
3. Por defecto, cambiar de plan o adelantar renovación pasa los créditos sobrantes a reserva y abre un nuevo período. Cancelar retira solo lo restante del plan y conserva toda la reserva.
4. La renovación gratuita vencida se procesa al siguiente acceso autenticado, **una sola vez para el período actual**. No se acumulan recargas de meses sin uso. No existe un cron ni cobro recurrente.
5. Al alcanzar el límite de saldo se suspende la nueva asignación; el panel sigue disponible y no se elimina la reserva. Los ajustes administrativos necesitan ID de abogado, motivo, confirmación y versión vigente.
6. Cambios, renovaciones y ajustes tienen identificador idempotente y control de versión. Reintentos/concurrencia no duplican asignaciones ni consumos. El frontend mantiene la clave al perder una respuesta para poder reintentar con seguridad.
7. Movimientos y bitácora registran deltas, saldos posteriores, caso vinculado cuando aplica, responsable administrativo y fecha. Las operaciones relacionadas se realizan en lotes transaccionales de D1; un conflicto no deja una actualización parcial.
8. Las escrituras pasan por sesión/rol, protección de origen/CSRF, validaciones y límites de cuerpo. Solo el propietario modifica economía y reserva; Google no concede privilegios administrativos.

**Modo de pago preparado:** cambiar la bandera no conecta un proveedor ni solicita tarjetas. Bloquea nuevas selecciones/renovaciones de plan y nuevos desbloqueos de contacto hasta una integración futura verificada. No quita saldos previos ni contactos ya desbloqueados; sigue permitiendo cancelación. Peticiones falsificadas de «pago exitoso» se rechazan. Producción permanece en **`free`**.

## Uso de los logos y límites del piloto

En Administración → Empresas y estudios, elegir categoría, nombre, texto alternativo, orden, imagen y confirmar autorización. Guardar como inactivo permite revisar antes de marcar «Mostrar en el home». El enlace es opcional y solo admite HTTPS seguro.

El navegador acepta PNG/WebP/JPEG de hasta 5 MB y 16 megapíxeles; comprime a PNG/WebP de **48 KiB**, conservando transparencia. El original no se envía. El servidor comprueba bytes reales, estructura raster y dimensiones; no acepta SVG, scripts ni imágenes animadas como contenido almacenado. Previsualizaciones inactivas son autenticadas y sin caché pública. Medios activos tienen versión, ETag, encabezados de tipo seguro y dimensiones reservadas para reducir saltos de layout.

Hay **40 espacios totales**, incluidos archivados, y **2 MiB de contenido codificado**. Archivar retira el logo y **libera sus bytes**; mantiene metadatos/bitácora y permite reutilizar el espacio subiendo una imagen nueva. La interfaz advierte esta consecuencia: conservar el archivo original fuera del sitio. No se archivó ni eliminó ningún logo real de producción en esta entrega.

Se reutiliza D1 y no se activó R2 ni un optimizador externo. Este diseño acotado sirve al piloto; antes de crecer, revisar cuotas de lecturas/escrituras y almacenamiento, sin contratar servicios automáticamente.

## Migración y despliegue comprobados

- Cuenta Cloudflare exclusiva utilizada: `4ea4b93b4874da271a0116bd4728f282`.
- Worker **`jurisconecta`**, base **`jurisconecta-db`**, ID `106131c9-81eb-49de-9418-421ccc172576`.
- Aplicadas únicamente `0014_credit_plans_and_reserves.sql` y `0015_home_partners.sql`. **No repetir ni aplicar las migraciones históricas en bloque**, porque se gestionaron manualmente.
- Antes: tres cuentas profesionales y **1.676 créditos**. Inmediatamente después: total **1.676**, saldo de plan 0 y reserva **1.676**; cero inconsistencias. Ningún crédito anterior se perdió. Renovaciones gratuitas futuras pueden cambiar ese total.
- Bookmark previo: `00000128-00000000-00005103-e1a2f15a1674b0d5c8a4eeafd2938eab`.
- Después de 0014: `00000129-0000000a-00005103-3334bc8a9434c1de0d4b6b8074b0ffde`.
- Después de 0015: `00000129-0000000f-00005103-768bce467695a6e5f8b880d2a9f5635a`.
- Versión desplegada: **`bc6c1a38-8e70-4a7a-a746-b974dfdca240`**, dominios `jurisconecta.cl` y `www.jurisconecta.cl`; arranque informado de 23 ms. No hay nuevos bindings ni cambios de dominio.

Los bookmarks son referencias de recuperación con disponibilidad temporal, no backups permanentes. Antes de una restauración hay que comprobar disponibilidad y evaluar los cambios posteriores que se perderían. No se restauró producción ni se modificaron cuentas/sesiones reales para probar.

## Pruebas y evidencias

**32/32 pruebas automatizadas aprobadas**, TypeScript, ESLint, build estático de 33 rutas, tipos de Wrangler y despliegue en seco correctos. El fixture SQLite ejecuta los lotes atómicamente para comprobar concurrencia de forma realista. Esto no sustituye una auditoría de seguridad independiente.

Casos nuevos: importación de créditos, una sola renovación vencida, rollover/cancelación, claves repetidas y operaciones simultáneas, consumo plan → reserva, costo cero, aceptación obligatoria, ajustes propietarios con auditoría, límites, modo pago bloqueado, formatos/quotas de logos, versiones, borradores privados y reutilización. Dos pruebas atraviesan el Worker por HTTP: publicación → propuesta → aceptación → desbloqueo concurrente exactamente una vez; y permisos/CSRF/configuración/precio de casos nuevos.

En Chrome, con base local en memoria y datos ficticios, se probaron selección de Gold, renovación anticipada, cancelación y reserva/historial correctos. Se activó pago **solo en local** para comprobar botones bloqueados. El carrusel tuvo dos filas, navegación por teclado y desplazamiento móvil a 390 px sin desbordamiento del documento. La demo se reinició en modo gratis y se detuvo al terminar.

En producción: home actualizado sin la tarjeta, `/api/health` 200, `/api/partners` 200 vacío, `www` redirige 308 y endpoints privados de planes/configuración devuelven 401 sin sesión. El panel GitHub autenticado cargó ambas secciones nuevas con configuración gratuita v1, 30 días, costo 5 y cero logos. Se revisó sin guardar ni otorgar créditos reales.

Evidencias:

- [Inicio publicado](proofs/home-production-20261013.png).
- [Planes y saldo, demo local ficticia](proofs/plans-desktop-demo-20261013.png).
- [Configuración de créditos, demo local](proofs/admin-billing-demo-20261013.png).
- [Carrusel móvil, nombres/imágenes ficticios](proofs/partners-mobile-demo-20261013.png).

Para repetir: `pnpm run build` y `pnpm exec tsx tests/visual-server.ts --features-demo`; abre `http://127.0.0.1:3008/planes/` o `/admin/`. Solo loopback, sin secretos reales, proveedores ni D1 remota. Solo estas APIs nuevas permiten escrituras locales; OAuth está bloqueado y el resto es de solo lectura. Detener con Ctrl+C. Sin la bandera, todas las escrituras se rechazan.

## Estado y próximos pasos

Ya existen registro/login correo y Google, administración GitHub/invitaciones, perfiles/fotos y verificación manual, casos/propuestas/comparación/aceptación, seguimiento del cliente a nivel plataforma, evaluaciones, tickets/avisos internos, controles de cuenta/sesiones/bitácora, noticias/editor, SEO y analítica con consentimiento. En esta entrega se completó el circuito gratuito de créditos y las colaboraciones del home.

Siguiente revisión: logos reales autorizados; Safari en iPhone físico; recorrido manual de cuentas ficticias y segunda invitación GitHub; límites antispam del login/registro por contraseña; términos/privacidad y retención; revisión de datos demo; backup/restauración; cuota Free. Siguen pendientes Semrush gratuito y verificar procesamiento del sitemap en Search Console, según el informe del 8 de octubre; no se volvieron a configurar ni se declaran terminados aquí.

Para acercarse al flujo de NexoAbogados faltan asignación/moderación mejoradas, comunicación dentro del caso, hitos ingresados por abogado, adjuntos seguros y honorarios/contratos. El cliente ya puede seguir su solicitud, pero **no hay sincronización con expedientes judiciales ni estadísticas jurídicas reales**. Emails/WhatsApp transaccionales, recuperación automática, compras extra/cupones y facturación/pagos todavía no están conectados.

Ruta propuesta: **13–19 octubre**, pruebas y seguridad operativa; **20–26 octubre**, textos legales, moderación, hitos/comunicación y contenido por materia; **27 octubre–3 noviembre**, restauración, rendimiento, indexación y piloto cerrado. Estimación de tres semanas para un piloto cauteloso, condicionada a revisión legal y pruebas. Un sistema comercial con pagos requiere decisiones, integración y ensayos adicionales. No hay autorización para contratar servicios ni generar cargos.
