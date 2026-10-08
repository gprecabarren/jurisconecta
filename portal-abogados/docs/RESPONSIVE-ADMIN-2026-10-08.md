# Responsive y administradores GitHub — 8 de octubre de 2026

## Resultado y alcance

Cambios desplegados exclusivamente en el Worker **jurisconecta** y sus dominios `jurisconecta.cl`/`www.jurisconecta.cl`. Versión final: **a5bffdcc-eb09-4227-90a7-be4ea490468e**. No se modificó Chile3X, no se activaron productos, planes, pruebas de pago ni envíos de correo. Se usaron los bindings existentes; subida documental R2 y mantenimiento continúan desactivados.

El repositorio sigue siendo un piloto. Estos ajustes no sustituyen revisión jurídica, auditoría independiente ni pruebas integrales de todos los módulos históricos. Los pendientes y cronograma general se conservan en el README.

## Cronología de esta actualización

1. Revisión del código y del panel abierto: sidebar sin contenedor interno de scroll, campos compactos de 11–15 px, enlaces móviles ausentes y controles ocultos por CSS antiguo.
2. Corrección del sidebar: altura dinámica de ventana, scroll independiente para las opciones y controles inferiores accesibles. En móvil se reemplaza por menú plegable con scroll interno y cierre con Escape/selección.
3. Reorganización del header público: login directo, menú hamburguesa con nueve enlaces y redes. Footer en columnas, redes consistentes y espacio seguro inferior. Menú nativo `details`, con script local diferido; noticias no requiere hidratación React para usarlo.
4. Campos y editores a un mínimo de 16 px hasta 980 px, incluyendo demostraciones anidadas. No se limita el zoom con los dedos. Se conservan acciones administrativas antes ocultas, se envuelven botones/textos y se impide que las animaciones laterales amplíen el viewport móvil.
5. Registro administrativo por ID estable GitHub, roles propietario/administrador e invitaciones que requieren usuario **y** correo verificado. Migración 0013 aislada, sin repetir migraciones históricas.
6. Pruebas y primer despliegue. La revisión visual detectó dos detalles adicionales: campos de 15 px en el formulario de demostración y salto de ancla al cerrar el menú. Se corrigieron y repitieron build/pruebas. Se añadió clipping horizontal al elemento raíz tras comprobar el home a 320 px.
7. Despliegue final, comprobaciones públicas, evidencia visual y actualización de documentación. El servidor visual temporal se detuvo y los tamaños de Chrome se restauraron.

## Cómo agregar al siguiente administrador

1. El propietario entra a `/admin/#administradores` y escribe el usuario GitHub y un correo **verificado en esa cuenta**.
2. Confirma que la persona debe acceder a los datos administrativos. El servidor consulta el ID público estable de GitHub, rechaza cuentas organizacionales, duplicados y usuarios ya activos.
3. Se genera un enlace privado por 72 horas. Copiarlo y entregarlo por un canal privado; **no se envía correo automático**. Si se pierde, revocar y generar uno nuevo.
4. El destinatario abre el enlace e inicia la verificación GitHub. OAuth usa PKCE S256 y state de un solo uso, con plazo de 10 minutos. Para invitaciones se solicita `read:user user:email`; el login normal usa `read:user`.
5. Se comparan ID GitHub y correo verificado. Una cuenta distinta, correo no verificado, invitación revocada o vencida no puede obtener acceso.
6. La persona debe aceptar explícitamente. Solo entonces se activa como `admin`; nunca como propietario. No obtiene permisos nuevos en GitHub ni Cloudflare.
7. El propietario puede revocar el acceso; se invalidan las sesiones y todas las rutas administrativas. No puede revocarse al propietario desde esta interfaz. Creación, aceptación y revocación quedan en la bitácora.

El propietario existente se conserva como `gprecabarren`, ID **58262409**. Las cookies antiguas se siguen validando contra la sesión y el registro activo. La identidad se basa en ID, por lo que un cambio de username no concede acceso a quien reutilice ese nombre. El rol se consulta en D1, no se acepta del cliente. Límite: 20 administradores activos y 6 invitaciones por hora. Los tokens de invitación/prueba se guardan como SHA-256; tokens OAuth GitHub no se persisten. La página de invitación retira su fragmento del historial, no carga analítica y lleva `noindex`.

**No se creó ninguna invitación real ni se concedió acceso a otra persona en esta revisión.** Queda pendiente el ensayo real cuando se defina quién será el segundo administrador. Todas las pruebas de creación/aceptación/revocación usaron proveedor simulado y SQLite en memoria.

## Base de datos y despliegue

- Cuenta Cloudflare: `4ea4b93b4874da271a0116bd4728f282`.
- D1: `jurisconecta-db`, ID `106131c9-81eb-49de-9418-421ccc172576`.
- Única migración de esta actualización: `0013_github_administrators.sql`.
- Bookmark previo: `0000009e-00000000-000050fe-7b9e046d6d5f8bc6351950d7c2ecf83b`.
- Bookmark posterior: `0000009e-00000008-000050fe-5404e51293b3c9cfb1af23df6dd6732e`.
- Resultado leído tras migrar: un propietario activo, tres sesiones históricas asociadas, ninguna invitación creada. Se ejecutaron nueve sentencias de migración; tamaño D1 observado 507.904 bytes.
- Versión final Worker: `a5bffdcc-eb09-4227-90a7-be4ea490468e`; paquete 574,67 KiB / gzip 129,15 KiB; arranque reportado 18 ms.

No ejecutar `wrangler d1 migrations apply --remote` en bloque: las migraciones históricas se aplicaron manualmente y pueden seguir figurando pendientes. No repetir 0013. Antes de cualquier restauración, comprobar disponibilidad actual de Time Travel y registrar impacto/autor; los bookmarks no garantizan retención indefinida.

## Verificación completada

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | TypeScript, ESLint y build correctos; 33 rutas estáticas. |
| `pnpm test` | 14 pruebas, 14 aprobadas. |
| Tipos Wrangler | `worker-configuration.d.ts` actualizado, sin cambios necesarios. |
| Dry-run y deploy | Worker correcto y solo dominios JurisConecta. |
| Invitaciones automáticas | ID/correo verificado, PKCE, sin privilegios antes de aceptar, aceptación explícita y única, rol `admin` fijo, protección del propietario, revocación de rutas/sesiones, CSRF y bitácora. |
| Cookies anteriores | Propietario conservado, cambio de username por ID estable, sesión revocada y firma falsificada rechazadas. |
| Privacidad de assets admin | Clonar respuestas antes de agregar `no-store`/`noindex`, incluso con headers inmutables. |
| Sidebar local 1200×500 | Opciones de 811 px en contenedor de 218 px; scroll por teclado llegó a «Mis dispositivos», sin perder controles inferiores. |
| Panel local 390×400 | Menú de 637 px en contenedor de 308 px; scroll interno alcanzó las últimas opciones. |
| Panel local 390×844 | 22 campos computados a 16 px; sección elegida queda aproximadamente a 100 px tras cerrar el menú. |
| Home/login públicos 320 px | Viewport y documento de 320 px, sin ampliación por animaciones; campos email/password a 16 px. |
| Noticias públicas 390 px | Nueve enlaces móviles, menú nativo abre/cierra con teclado/Escape, buscador 16 px; footer sin desbordamiento horizontal. |
| HTTP sin sesión | Health 200; `/admin/` redirige 302 a GitHub; APIs admin y prueba de invitación 401 `no-store`; página de invitación y `navigation.js` 200. |

### Evidencia

- [Menú móvil público en producción](proofs/public-mobile-navigation-20261008.png).
- [Footer móvil público en producción](proofs/public-mobile-footer-20261008.png).
- [Sidebar en ventana baja — fixture local](proofs/admin-sidebar-short-window-20261008.png).
- [Administradores móvil — fixture local](proofs/admin-administrators-mobile-20261008.png).

Las capturas administrativas son **locales, con base en memoria**, no evidencia de una segunda cuenta real. Se conservaron las pestañas originales del usuario y no se volcaron cookies ni credenciales. El servidor de prueba solo escuchó en `127.0.0.1:3008`, rechazó escrituras HTTP y se detuvo al finalizar.

## Límites y ruta de revisión pendiente

Una pestaña nueva del panel en Chrome devolvió `ERR_BLOCKED_BY_CLIENT`; no se pudo confirmar su causa ni verificar visualmente el nuevo panel autenticado en producción desde esa pestaña. No se desactivaron protecciones del navegador. Las páginas públicas funcionaron, las APIs sin sesión exigieron autorización y las pruebas locales cubrieron permisos/visualización. La pestaña original del usuario se dejó abierta sin recargar para no perder posibles cambios sin guardar.

Próxima revisión, con datos de prueba y sin permisos reales innecesarios:

1. Recargar el panel de producción tras guardar cualquier edición pendiente; comprobar lista del propietario y sidebar al 100%, 200% y 300% de zoom, incluida la última opción.
2. En iPhone físico/Safari, enfocar campos de login, registro cliente/abogado, tickets y editor: comprobar autozoom, teclado, orientación y zoom manual. Chrome responsive **no sustituye esta prueba**.
3. Repetir navegación/header/footer a 320/390 px, paisaje y pantalla baja; seleccionar una sección y confirmar que el menú cierra y el bloque queda visible.
4. Cuando se designe al segundo administrador, hacer un ensayo de invitación/aceptación real por GitHub y verificar bitácora. No compartir el enlace públicamente ni invitar una cuenta ficticia a producción.
5. Continuar las pruebas históricas de casos/propuestas, perfiles, tickets, recuperación y eliminación según el README; revisión legal, antibots por contraseña, retención/restauración D1 y vigilancia de cuota Free siguen pendientes.

La cuota Free debe vigilarse; no se activó un cargo nuevo y el código no puede garantizar ausencia absoluta de cobros por otros productos o consumo de la cuenta.
