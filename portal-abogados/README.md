# JurisConecta

Portal chileno para conectar personas con abogados verificados. Sitio: [jurisconecta.cl](https://jurisconecta.cl). Repositorio: [gprecabarren/jurisconecta](https://github.com/gprecabarren/jurisconecta). Estado revisado el **2 de octubre de 2026**.

## Arquitectura y límites de costo

- Next.js 16 exporta páginas estáticas; el Worker Cloudflare **`jurisconecta`** sirve archivos, protege páginas por rol y despacha `functions/api`. La base exclusiva es D1 **`jurisconecta-db`**. La zona y dominio son exclusivamente `jurisconecta.cl` y `www.jurisconecta.cl`.
- **No modificar ni desplegar Chile3X** desde este repositorio. Cualquier consulta de su código es solo de referencia visual, en modo lectura.
- La fuente Manrope se incluye en el build mediante `next/font`, no se pide al equipo del visitante. Las fotos profesionales se comprimen en el navegador (hasta 24 KB) y se almacenan en D1. Para un piloto pequeño esto evita habilitar nuevos servicios; si el volumen crece habrá que rediseñar el almacenamiento.
- Existe un bucket R2 antiguo vinculado al Worker para antecedentes legados, pero **la subida de documentos sigue desactivada** (`LAWYER_APPLICATION_UPLOADS_ENABLED=false`). La verificación de identidad y título se coordina por video o presencialmente; el administrador debe registrar método y nota antes de aprobar. No se suben documentos nuevos a R2.
- Créditos y planes son **de prueba**. No hay pasarela de pago, facturación, renovación cobrable, envío automático de emails/WhatsApp ni servicios de IA pagados. La cuenta de Cloudflare debe permanecer en Free y su consumo debe vigilarse; el código por sí solo no puede garantizar ausencia absoluta de cobros por otros productos de la cuenta.

## Funcionalidad implementada

| Área | Estado |
| --- | --- |
| Portada y contenido | Inicio, catálogo legal, equipo, ayuda; header público persistente con **iniciar sesión** y **registrarse**, redes oficiales administrables y footer social. Manrope, estilo propio redondeado y apariciones suaves al desplazar, desactivadas con movimiento reducido. |
| Cuentas | Registro y login por correo para personas/abogados; admin por GitHub OAuth (login autorizado `gprecabarren`). Cambio de contraseña profesional, recuperación asistida con código de 30 minutos y verificación manual de identidad. |
| Sesiones | Registro de navegador/dispositivo y ubicación aproximada, lista de sesiones activas y cierre selectivo. La ubicación puede ser inexacta por VPN. La sesión se vuelve inválida al deshabilitar/eliminar la cuenta o cambiar/restablecer la contraseña. Las cookies antiguas sin ID de sesión deberán volver a iniciar sesión después del despliegue de este cambio. |
| Perfil profesional | Datos, especialidades, presentación y foto comprimida persistidos. Postulación sin archivos; aprobación solo tras revisión manual documentada. |
| Casos | Clientes publican y cierran casos; abogados aprobados revisan pool/preferentes. Hasta tres propuestas por caso, comparación y aceptación/descartar desde la vista del cliente. **El contacto solo puede desbloquearlo el abogado aceptado** con créditos de prueba; una regla de D1 también lo impide sin aceptación. |
| Seguimiento cliente | `/cliente` y `/cliente/caso?id=…`: estado, etapas, vistas, propuestas y evaluación luego del cierre. Son hitos de la plataforma, **no un expediente judicial sincronizado**. |
| Soporte | FAQ primero, medios de contacto, tickets de usuarios autenticados, hilo y respuestas; bandeja administrativa y notificaciones internas. El correo `hola@jurisconecta.cl` se muestra como canal, pero no se sincroniza con tickets ni se ha verificado aquí su entrega. |
| Administración | Bandeja de tickets, postulaciones, costos en créditos, contenido, redes oficiales, recuperación, directorio paginado de clientes/abogados con detalle y casos, habilitar/deshabilitar/eliminar cuentas mediante confirmación. Vista previa de registro cliente/abogado y pasos del caso usando los mismos formularios, sin crear datos y con avance libre más advertencias. Bitácora de cambios administrativos con hora UTC y login de GitHub. Las acciones anteriores a la bitácora no se pueden reconstruir. |
| Control de cuenta | Clientes y abogados pueden deshabilitar o eliminar su propia cuenta desde su panel, con contraseña y confirmación; la eliminación borra datos asociados por cascada y deja un registro mínimo sin identificación personal. |
| Evaluaciones | Cliente evalúa al abogado aceptado solo después de cerrar el caso; abogado ve sus evaluaciones reales. |
| Textos legales | `/privacidad` y `/terminos` son **borradores**, no documentos aprobados para captar casos reales. |

## API principal

`/api/auth/{register,login,logout,me,profile,password,recovery,account,sessions}`,
`/api/cases`, `/api/client/proposals`, `/api/lawyer/{profile,application,cases,plans,proposals}`,
`/api/{tickets,notifications,notifications/preferences,reviews,content,health}` y
`/api/admin/{applications,cases,content,profiles,tickets,recovery,users,audit,sessions}`.
GitHub OAuth usa `/auth/github/login` y `/auth/github/callback`.
Todas las rutas administrativas comprueban la sesión GitHub autorizada; las privadas por rol comprueban la sesión de usuario.

## Migraciones

`migrations/0001` a `0006` son historia del proyecto. Las nuevas:

- `0007_interactions_and_support.sql`: propuestas limitadas, aceptación previa a contacto, tickets, avisos, evaluaciones, recuperación, avatar y versionado de sesión.
- `0008_account_control_and_audit.sql`: sesiones de usuarios y administradores, bitácora y registro mínimo de eliminaciones.
- `0009_site_social_links.sql`: redes oficiales configurables desde administración, visibles solo al ingresar enlaces HTTPS válidos de cada plataforma. No hay enlaces predeterminados ni se copian los de Chile3X.

Las migraciones `0007` y `0008` se aplicaron previamente solo a `jurisconecta-db`. La `0009` se probó con todas las anteriores en D1 local aislado y se aplicó **solo** a esa base el 2 de octubre, tras comprobar el esquema y obtener un bookmark de Time Travel. Como las migraciones históricas se ejecutaron manualmente, `wrangler d1 migrations list --remote` aún las muestra pendientes: **no ejecutar `migrations apply --remote` en bloque**. La ventana gratuita de recuperación de D1 es limitada.

## Desarrollo, compilación y despliegue

```bash
pnpm install
pnpm check
pnpm exec wrangler types worker-configuration.d.ts --env-interface CloudflareEnv --check
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy
```

El despliegue solo debe utilizar `wrangler.jsonc` de este directorio y el Worker `jurisconecta`. No incluir secretos en Git. Se requieren `USER_AUTH_SECRET`, `AUTH_SESSION_SECRET` y `GITHUB_CLIENT_SECRET` en Cloudflare. OAuth GitHub usa el callback exacto `https://jurisconecta.cl/auth/github/callback`.

## Ruta de testeo con datos ficticios

1. Comprobar `/api/health`, inicio, `/soporte`, `/privacidad` y `/terminos` en móvil y escritorio; `www` debe redirigir al dominio principal.
2. Registrar un cliente ficticio, cerrar/abrir sesión y verificar `/cliente`, `/cliente/cuenta`, sesiones activas y cierre de otra sesión desde un segundo navegador.
3. Publicar un caso ficticio; verificar conteo de vistas, etapas y acceso a `/cliente/caso?id=…`. Crear un ticket, responderlo y comprobar la bandeja administrativa.
4. Registrar un abogado ficticio; editar perfil/foto y enviar postulación **sin documentos**. Entrar a `/admin` con GitHub, verificar originales por el procedimiento manual y aprobar. No aprobar a una persona real durante pruebas.
5. Abogado aprobado envía propuesta; cliente compara y acepta. Antes de aceptación, el desbloqueo debe devolver 403. Después de aceptación, solo ese abogado puede desbloquear el contacto con créditos de prueba. Cerrar caso y registrar una evaluación.
6. Revisar directorio de usuarios, detalle/casos, bitácora y recuperación asistida. Probar deshabilitar, reactivar y eliminar **solo las cuentas ficticias creadas para la prueba**, confirmando que ya no aparecen ni pueden iniciar sesión.
7. Verificar permisos cruzados: cliente no ve `/admin` ni APIs de abogado; abogado no ve casos privados ajenos; usuario sin sesión recibe 401; probar teclado, lector de pantalla, errores y diseño móvil.
8. Desde `/admin#redes`, agregar una URL oficial de prueba propia, verificarla en header/footer de inicio, equipo y soporte, y retirarla. Desde `/admin#vista-previa`, revisar ambos registros y los tres pasos del caso con campos vacíos; comprobar advertencias y que no se crean cuentas ni casos. Validar header fijo y animaciones en móvil/escritorio y con movimiento reducido.

## Qué falta antes de invitar usuarios reales

Prioridad alta: revisión jurídica de términos/privacidad y política de retención; pruebas integrales de permisos y eliminación; rate limiting/antibots de login y registro; revisión de seguridad independiente; procedimiento operativo de verificación manual y respuesta a tickets; ensayo de backup/restauración D1; observación de cuota Free. El sistema de avisos es solo interno y la recuperación requiere intervención humana.

Para acercarse a [NexoAbogados](https://www.nexoabogados.cl/) aún faltan mejor asignación de casos por especialidad/zona, moderación de casos, comunicación bidireccional dentro del caso, gestión de honorarios y contratos, y eventualmente notificaciones transaccionales. El diferencial propio de JurisConecta —cuenta del cliente y seguimiento— existe en forma de **estado de plataforma**, pero faltan hitos de la causa ingresados por el abogado, adjuntos seguros y estadísticas jurídicas reales. Ningún avance judicial se sincroniza automáticamente.

### Cronograma cauteloso de tres semanas (2–23 de octubre)

| Semana | Trabajo | Condición para seguir |
| --- | --- | --- |
| 2–8 oct | Pruebas end-to-end con cuentas ficticias, roles, tickets, sesiones, auditoría, eliminación y aceptación de propuestas; corregir incidencias. | Sin contactos expuestos antes de aceptación ni datos de prueba residuales. |
| 9–15 oct | Revisión legal, privacidad y retención; diseño de hitos reales de causa, moderación y protección antispam dentro de Free; accesibilidad/móvil. | Textos aprobados y recorrido completo entendible para cliente y abogado. |
| 16–23 oct | Implementar hitos de causa, ensayar recuperación D1, medir rendimiento y cuota, piloto cerrado y revisión final. | Sin bloqueos críticos, costos vigilados y autorización expresa antes de captar usuarios reales. |

Estimación: **unas 3 semanas para un piloto controlado**, condicionadas a revisión legal y pruebas; un producto comercial con pagos y notificaciones externas requiere trabajo y decisiones adicionales. No se activarán componentes facturables por esta hoja de ruta.
