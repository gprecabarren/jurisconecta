# JurisConecta

Portal chileno para conectar personas que necesitan orientación legal con abogados verificados. El sitio oficial es [jurisconecta.cl](https://jurisconecta.cl).

## Estado actual (1 de octubre de 2026)

La aplicación es un frontend Next.js exportado como sitio estático y servido por el Worker `jurisconecta`. El mismo Worker atiende las rutas dinámicas que antes estaban preparadas como Cloudflare Pages Functions en `functions/`.

Infraestructura exclusiva de JurisConecta:

- Zona y dominios: `jurisconecta.cl` y `www.jurisconecta.cl`; `www` redirige al dominio principal.
- Worker: `jurisconecta`, con Static Assets y enrutamiento de API.
- D1: `jurisconecta-db` mediante el binding `DB`.
- R2: `jurisconecta-private-documents` mediante `LAWYER_DOCUMENTS`, únicamente para antecedentes privados de postulaciones profesionales.
- Repositorio: `gprecabarren/jurisconecta` (antes `gprecabarren/jurisconecta-mvp`).

No se debe usar, modificar ni desplegar ningún recurso de `chile3x.cl` desde este proyecto.

El proyecto heredado de Cloudflare Pages `jurisconecta-mvp` fue eliminado el 9 de septiembre de 2026. Solo publicaba copias en `*.pages.dev` y no servía el dominio oficial. La producción y los futuros despliegues quedan centralizados en el Worker `jurisconecta`.

### Diseño y rendimiento

- Manrope se usa en todo el sitio mediante `next/font/google`: Next.js la descarga durante la compilación, la incluye en los archivos estáticos del mismo dominio y genera un preload. El navegador no depende de Google Fonts ni de archivos del computador del desarrollador en cada visita.
- La identidad combina azul marino, dorado y blanco cálido inspirados en [Bosich Legal](https://bosichlegal.cl/); los tamaños de títulos toman como referencia Chile3X sin reutilizar sus botones ni modificar ese proyecto. Los botones de JurisConecta son redondeados, con estados de foco y movimiento reducido para quien lo solicite.
- La portada ya no depende de una fotografía remota de Unsplash: usa un fondo CSS, con menos recursos externos al cargar.
- [NexoAbogados](https://www.nexoabogados.cl/) es una **referencia de flujo de producto**, no una integración ni una promesa de funciones terminadas: solicitud guiada, propuestas de profesionales, comparación y elección del abogado. El flujo de propuestas todavía está pendiente aquí.

### Control de costos

El Worker y D1 están configurados para el plan Free. La carga de documentos a R2 queda **desactivada por defecto** con `LAWYER_APPLICATION_UPLOADS_ENABLED=false`, porque R2 dispone de una franquicia gratuita pero puede generar cobros al superarla. No cambiar esta variable a `true` sin definir primero límites operativos, retención de archivos y alertas de consumo. No se activaron planes, integraciones ni complementos pagados durante esta configuración.

Ningún repositorio puede garantizar por sí solo que una cuenta de Cloudflare no genere cobros por uso o por productos previamente activados. Antes de aceptar postulaciones reales, revisar el consumo y las condiciones oficiales de [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) y [R2](https://developers.cloudflare.com/r2/pricing/). Las pruebas automatizadas no deben subir archivos a R2.

## Módulos existentes y alcance real

- Registro e inicio de sesión por correo para personas y abogados.
- Sesión segura mediante cookie HTTP-only firmada.
- Área de cliente: datos personales, publicación, listado y cierre de casos.
- Área profesional: perfil, formulario de postulación, planes visibles, saldo de créditos, casos preferentes, pool y desbloqueo de contacto. **La carga de documentos permanece desactivada** para evitar consumo de R2 y la postulación completa no puede aprobarse en autoservicio sin habilitar una vía documental segura.
- Administración: OAuth con GitHub, revisión de postulaciones y documentos, aprobación de abogados, asignación de créditos, edición del costo de casos y contenido público.
- Contenido público: portada, equipo, ayuda, catálogo legal y búsqueda informativa.
- Protección en el Worker de las páginas privadas según rol.

Limitaciones que no deben confundirse con funciones terminadas:

- `/account` muestra formularios de perfil profesional, contraseña y preferencias, pero su botón de guardar solo confirma localmente; no persiste cambios. `/cliente/cuenta` **sí** guarda datos básicos por API.
- `/evaluaciones` es una pantalla vacía informativa. El panel profesional tiene avisos de ejemplo, no notificaciones reales.
- No hay API ni interfaz para enviar, comparar o aceptar propuestas; `case_proposals` es solo una tabla preparada. Actualmente un profesional aprobado puede gastar créditos de prueba para desbloquear el contacto de un caso, sin paso explícito de aceptación del cliente. Revisar y ajustar este punto antes de captar casos reales.
- Los planes y créditos son de prueba/asignación administrativa. No hay pagos, cobros automáticos, renovación efectiva ni Webpay habilitado.
- Faltan recuperación/cambio efectivo de contraseña, correos transaccionales, páginas legales completas y artículos de ayuda desarrollados.

## Rutas del Worker

| Ruta | Métodos | Uso |
| --- | --- | --- |
| `/api/health` | `GET`, `HEAD` | Estado del servicio |
| `/api/content` | `GET` | Equipo y centro de ayuda públicos |
| `/api/auth/register` | `POST` | Registro de persona o abogado |
| `/api/auth/login` | `POST` | Inicio de sesión |
| `/api/auth/logout` | `POST` | Cierre de sesión |
| `/api/auth/me` | `GET` | Usuario autenticado |
| `/api/auth/profile` | `PATCH` | Perfil básico del cliente |
| `/api/cases` | `GET`, `POST`, `PATCH` | Casos del cliente |
| `/api/lawyer/profile` | `GET`, `PATCH` | Perfil profesional |
| `/api/lawyer/application` | `POST` | Postulación y documentos |
| `/api/lawyer/plans` | `GET` | Planes y créditos |
| `/api/lawyer/cases` | `GET`, `POST` | Pool, preferentes y acceso a contacto |
| `/api/admin/content` | `GET`, `PUT` | Contenido administrable |
| `/api/admin/profiles` | `GET` | Profesionales registrados |
| `/api/admin/applications` | `GET`, `PATCH` | Revisión de postulaciones |
| `/api/admin/application-document/:id` | `GET` | Lectura privada de documentos |
| `/api/admin/cases` | `GET`, `PATCH` | Casos y costo en créditos |
| `/auth/github/login` | `GET` | Inicio OAuth de administración |
| `/auth/github/callback` | `GET` | Retorno OAuth de administración |

Las rutas privadas de páginas (`/cliente`, `/publicar-caso`, `/dashboard`, `/account`, `/casos`, `/planes`, `/postulacion-abogado`, `/evaluaciones` y `/admin`) también pasan primero por el Worker.

## Desarrollo y verificación

Requisitos: Node.js, pnpm y una sesión de Wrangler conectada a la cuenta correcta de Cloudflare.

```bash
pnpm install
pnpm dev
```

Antes de cada despliegue:

```bash
pnpm check
npx wrangler types worker-configuration.d.ts --env-interface CloudflareEnv --check
npx wrangler deploy --dry-run
```

Despliegue manual al Worker configurado:

```bash
pnpm run deploy:cloudflare
```

## Variables secretas

Nunca guardar valores reales en Git. El Worker requiere:

- `USER_AUTH_SECRET`: firma las sesiones de personas y abogados.
- `AUTH_SESSION_SECRET`: firma la sesión de administración.
- `GITHUB_CLIENT_SECRET`: secreto de la aplicación OAuth de GitHub.
- Opcionales: `GITHUB_CLIENT_ID` y `ADMIN_GITHUB_LOGIN`; hoy existen valores predeterminados para la aplicación y el administrador actuales.

Se administran con `wrangler secret put NOMBRE`. El callback autorizado de la aplicación OAuth debe incluir `https://jurisconecta.cl/auth/github/callback`.

`USER_AUTH_SECRET`, `AUTH_SESSION_SECRET` y `GITHUB_CLIENT_SECRET` están configurados en el Worker. La aplicación OAuth `JurisConecta Administración` usa `https://jurisconecta.cl/` como página principal, el callback exacto `https://jurisconecta.cl/auth/github/callback` y no permite coincidencias mediante comodines.

## Ruta de prueba manual

1. Abrir `/api/health` y comprobar `status: ok`.
2. Abrir `/api/content` y comprobar las colecciones `team` y `help`.
3. Ir a `/registro`, crear una persona y confirmar que redirige a `/cliente`.
4. Desde `/publicar-caso`, crear un caso; comprobarlo en `/cliente` y luego cerrarlo.
5. Cerrar sesión en `/ingresar`, registrar un abogado y confirmar la redirección a `/postulacion-abogado`.
6. Probar la edición del perfil profesional. No subir documentos de prueba mientras no se confirme el control de consumo de R2.
7. Entrar por `/admin` con GitHub y revisar contenido, perfiles, postulaciones y costos de casos.
8. Tras aprobar un abogado, comprobar `/casos/preferentes`, `/casos/pool`, el descuento de créditos y `/casos/accedidos` con datos que no sean reales.
9. Repetir en móvil y escritorio, revisando navegación por teclado, mensajes de error y cierre de sesión.

### Verificación realizada

El 9 de septiembre de 2026 se completaron estas pruebas funcionales (no equivalen a una auditoría de seguridad ni a una nueva prueba integral de octubre):

- TypeScript, ESLint, exportación estática de 21 páginas, tipos generados por Wrangler y empaquetado de despliegue, sin errores.
- Pruebas HTTP locales de respuestas `200`, `401`, `404`, `405` y redirecciones de páginas privadas.
- Pruebas en `https://jurisconecta.cl` del dominio principal, redirección `www`, contenido público y controles de acceso.
- Flujo real de persona: registro, sesión, perfil, crear/listar/cerrar caso y limpieza posterior de todos los datos de prueba.
- Flujo real de abogado: registro, perfil en estado `draft`, tres planes disponibles y limpieza posterior de todos los datos de prueba.
- Flujo real de administración: redirección a GitHub, callback en el dominio oficial, creación de sesión y carga del panel protegido `/admin/`.
- No se subieron archivos a R2 ni se probaron pagos.

El 1 de octubre de 2026 se verificaron TypeScript, ESLint, compilación de las 21 páginas estáticas, empaquetado de Wrangler, inclusión/preload de archivos `.woff2` de Manrope y prueba HTTP del dominio oficial (`/`, `/api/health`, `/api/content`, recurso de fuente y redirección de `www`). También se revisó la portada en Chrome de escritorio y móvil. Despliegue: Worker `jurisconecta`, versión `6f735d1b-811e-40f8-9032-f2476202d66f`. No se repitieron pruebas end-to-end de registro, casos ni administración con datos de prueba en esta fecha.

## Ruta cautelosa de tres semanas

Objetivo al **21 de octubre de 2026**: piloto controlado, sin pagos ni servicios de pago. Es una estimación para una persona que desarrolla y revisa; no incluye demoras de decisiones legales, contenido aportado por terceros ni contratación de un servicio externo. Cada semana termina con una revisión y no se avanza a usuarios reales si sus criterios fallan.

| Fechas | Implementación y revisión | Criterio de salida |
| --- | --- | --- |
| 1–7 oct · base confiable | Revisar cada flujo real con datos ficticios: registro de ambos roles, sesiones, permisos, crear/cerrar caso, consumo de créditos y administración. Corregir mensajes que hoy sugieren aceptación del cliente o cobros que todavía no existen. Conectar `/account`, incluyendo perfil y contraseña, y decidir un proceso manual para verificar abogados sin habilitar R2. | Pruebas reproducibles, datos de prueba retirados, ningún formulario que diga «guardado» sin persistir, política clara de contacto y documentos. |
| 8–14 oct · flujo principal | Construir envío de propuestas, límite de profesionales por caso, vista comparativa y aceptación/rechazo por el cliente. Revisar coincidencia por especialidad y región. Añadir notificaciones dentro del sitio; correo solo si existe una opción gratuita y aprobada. | Una persona puede publicar y comparar propuestas; un abogado ve únicamente casos/contactos autorizados; pruebas de roles y límites pasan. |
| 15–21 oct · cierre y piloto | Evaluaciones tras casos cerrados; textos de privacidad, términos, ayuda y consentimiento revisados; rate limiting/antibots dentro de Free; pruebas de accesibilidad, móvil, rendimiento, seguridad, backup/restore de D1 y monitorización de uso. Piloto cerrado con usuarios de prueba. | Sin bloqueos críticos ni datos sensibles expuestos, costos observados dentro de Free, checklist de piloto firmado antes de invitar usuarios. |

Orden de testeo recomendado: `/api/health` → portada/equipo/soporte en móvil y escritorio → `/registro` e `/ingresar` para ambos roles → `/publicar-caso` y `/cliente` → `/postulacion-abogado` (sin subir archivos) → `/admin` → `/casos/pool`, `/casos/preferentes`, `/casos/accedidos` y `/planes` → cierre de sesión y verificación de acceso denegado entre roles. Repetir después de cada cambio de API o permisos.

La referencia de **tres semanas es para un piloto sin pagos**. Una versión comercial con Webpay, renovaciones y conciliación requiere otras **1–2 semanas de implementación y pruebas**, además de decisión sobre costos y condiciones; no se activará mientras la instrucción sea no generar cobros.

## Migraciones

Las migraciones D1 están en `migrations/0001_initial_schema.sql` a `migrations/0006_case_views_and_catalog.sql`. No volver a ejecutar migraciones que contienen `ALTER TABLE` sin comprobar antes el estado de la base remota.
