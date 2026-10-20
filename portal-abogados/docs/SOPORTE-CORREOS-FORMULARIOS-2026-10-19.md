# Soporte, correos y formularios — 19 de octubre de 2026

Entrega de JurisConecta: [sitio](https://jurisconecta.cl), Worker `jurisconecta`, D1 `jurisconecta-db`, rama `codex/mvp-inicial`. **No se modificó Chile3X ni se activó un producto de pago.** El sitio sigue siendo un piloto; las plantillas no envían correos y los formularios requieren revisión jurídica humana.

## 1. Qué cambia

### Soporte y tickets

- Se captura el formulario antes de esperar la respuesta del servidor, evitando mostrar un error tras una escritura exitosa. Si guardar funciona y falla la recarga posterior, la interfaz distingue ambas cosas y no pide reenviar.
- Bandeja con búsqueda normalizada en español —mayúsculas, tildes y ñ— y filtros de estado, sin responder, categoría, cliente/abogado, prioridad y responsable.
- Asignación a administradores GitHub activos y prioridades. Cada cambio conserva versión, fecha y autor en la bitácora.
- Notas internas separadas de las respuestas públicas. La API del usuario las excluye; no se ocultan solo mediante CSS. Los mensajes administrativos nuevos registran el autor GitHub. Los mensajes antiguos sin autor individual se identifican como registro anterior, sin inventarlo.
- Listas e historial paginados. El hilo abre los 20 mensajes más recientes y permite cargar otros 20 anteriores; una conversación larga no queda truncada por un límite global. El historial tiene desplazamiento propio y acceso por teclado, dejando los controles y editor fuera de ese bloque.
- Avisos persistentes para el equipo cuando entra un ticket, responde el usuario o se reabre. Cada administrador registra su lectura; el indicador consulta solo el conteo, sin datos personales, con la pestaña visible y a intervalos de 90 segundos. **Son avisos dentro del sitio, no emails ni notificaciones push.**
- Tiempos de primera respuesta, resolución y espera. Son tiempos transcurridos de calendario, no una promesa de SLA ni un calendario de horas hábiles.
- El cliente puede vincular sus propios casos; el abogado activo y aprobado, aquellos que atiende mediante propuesta aceptada. El servidor vuelve a comprobar permisos al guardar.
- Cambios de ticket, mensaje, avisos y métricas se protegen transaccionalmente. La versión esperada rechaza ediciones concurrentes y el identificador de petición evita repetir una operación ya guardada.
- Límites: cinco tickets nuevos por usuario en 24 horas, 30 respuestas de usuario por hora y 200 actualizaciones administrativas por hora. No sustituyen un procedimiento de atención ni protecciones antispam de otros módulos.

Rutas: [soporte público](https://jurisconecta.cl/soporte/), [bandeja administrativa](https://jurisconecta.cl/admin/#tickets), `GET/POST/PATCH /api/tickets` y `GET/PATCH /api/admin/tickets`.

### Correos y plantillas

Nueva sección: [Administración → Correos y plantillas](https://jurisconecta.cl/admin/correos/). Incluye 12 ejemplos:

1. Bienvenida de cliente.
2. Bienvenida de abogado.
3. Verificación de correo.
4. Recuperación de contraseña.
5. Caso recibido.
6. Nueva propuesta.
7. Propuesta aceptada.
8. Revisión profesional.
9. Ticket recibido.
10. Respuesta de soporte.
11. Aviso de soporte al equipo.
12. Aviso de seguridad.

Se pueden editar asunto, nombre visible del remitente, dirección de respuesta, HTML, texto alternativo y variables permitidas para cada evento. La edición visual es opcional, con controles de formato y acceso al HTML/texto. El servidor sanitiza también el contenido editado; los pegados son texto y no se permiten archivos arrastrados.

El borrador y la versión publicada son independientes. El historial conserva versiones, autor y fecha; una versión anterior se carga al borrador para revisarla, sin publicarla automáticamente. El control de revisión evita sobrescribir a otro editor. Los administradores autorizados editan; **solo el propietario publica, con confirmación expresa**.

El diseño tiene restricciones deliberadas: sin JavaScript, formularios, imágenes/píxeles remotos ni recursos externos. Las variables se escapan y los enlaces del contenido quedan limitados a HTTPS de `jurisconecta.cl`. La vista previa usa datos ficticios, iframe aislado y una política que bloquea acceso a la red.

**Estado real del envío: deshabilitado.** Guardar o publicar solo modifica contenido editorial. No se conectó Gmail, Cloudflare Email Service ni otro proveedor; no se solicitan tarjetas y no se enviaron pruebas reales. El remitente actual es `jurisconecta.site@gmail.com`; la dirección de respuesta se restringe a Gmail o `@jurisconecta.cl`. Una dirección empresarial no se provisiona ni valida por escribirla aquí.

La función de preparación devuelve `delivery_disabled`; los eventos reales y la recuperación asistida aún no consumen estas plantillas para enviar. La plantilla de recuperación no crea por sí sola un flujo automático de tokens/enlaces. Falta aprobar un transporte gratuito, sus límites y su seguridad antes de conectar entregas, reintentos y eventos.

API: `GET/POST/PATCH /api/admin/email-templates`, siempre con sesión administrativa GitHub. La previsualización y sanitización tampoco envían correo.

### Formularios de los 78 tipos de caso

- Cada tipo tiene un ejemplo ficticio propio, cuatro preguntas específicas y un recorrido predeterminado de tres etapas. Dos preguntas específicas adicionales son opcionales.
- Las fichas tienen fecha editorial, nota, ejemplo y referencias oficiales editables. Hay 32 fuentes oficiales identificadas en la matriz de cobertura, no 78 dictámenes profesionales.
- Se pueden agregar, modificar, quitar y reordenar etapas y preguntas. Se conserva al menos una etapa y una pregunta por etapa; máximos de cinco etapas y veinte preguntas. La eliminación pide confirmación y hay aviso de cambios sin guardar.
- La demostración usa el componente público: los cambios locales se reflejan inmediatamente; muestra validaciones, pero permite avanzar sin crear un caso.
- «Cargar ejemplo actualizado» pide confirmación y copia preguntas/referencias al borrador local. **No guarda automáticamente ni sobrescribe personalizaciones de D1.** El guardado posterior usa versiones y bitácora.
- Los borradores del cliente y casos enviados conservan el esquema que tenían, sin reinterpretar respuestas antiguas con preguntas nuevas.
- Se limita la recopilación de datos sensibles, especialmente sobre menores, violencia y derechos humanos. No se exige un relato gráfico ni se presenta la plataforma como una denuncia formal o servicio de emergencias.

Los ejemplos son herramientas de admisión inicial: no calculan plazos, derechos, sanciones, competencia ni probabilidades de éxito. **Revisión jurídica humana pendiente**, especialmente ante reformas y reglas transitorias. No se certifica que todas las leyes o todas las URLs hayan sido validadas profesionalmente.

[Fuentes oficiales y cobertura de los 78 tipos](FUENTES-FORMULARIOS-2026-10-19.md). Editor: [Casos y formularios](https://jurisconecta.cl/admin/#tipos-casos).

## 2. Privacidad, rendimiento y diseño

- Paneles, formularios y API privadas no son páginas de captación SEO. Las respuestas API incluyen `X-Robots-Tag: noindex, nofollow, noarchive`; las rutas administrativas y redirecciones de acceso añaden cabeceras de no almacenamiento/indexación.
- El editor de correos y los casos no añaden información privada al sitemap ni a la analítica. Se mantiene el consentimiento de medición de las páginas públicas.
- La portada consume `GET /api/case-types?view=summary`: solo las tarjetas necesarias, sin incluir en su carga inicial todos los formularios y referencias jurídicas. La API completa sigue disponible para el recorrido.
- Controles móviles de 16 px, distribución adaptable, contraste y áreas desplazables. Una simulación de tamaño móvil no equivale a una prueba en Safari de iPhone físico.
- No se incorporan landings jurídicas nuevas ni se promete posicionamiento por esta entrega. Contenido público original, revisión legal y seguimiento de Search Console/Semrush siguen siendo trabajos separados.

## 3. Validación

La suite local reúne **92 pruebas aprobadas** y el build estático **35 rutas**. TypeScript, ESLint, build, tipos Wrangler (`--env-interface=CloudflareEnv --check`) y despliegue en seco finalizaron correctamente tras el último cambio. El Worker preparado ocupa 772,42 KiB (177,87 KiB gzip) y sirve 397 archivos estáticos, sin agregar bindings.

Cobertura nueva: permisos/propiedad de tickets, notas internas, asignación, búsqueda española, paginación, cierre/reapertura, límites, métricas, transacciones, concurrencia/idempotencia; sanitización/variables/revisiones/publicación de plantillas; formularios, referencias y payload resumido; autenticación, mantenimiento y cabeceras de integración. La suite usa SQLite en memoria y proveedores simulados, no escribe en D1 remota. No es una auditoría de seguridad independiente ni prueba exhaustiva de todo el código histórico.

Pruebas visuales locales realizadas con datos ficticios: guardar una nota interna y comprobar su ausencia en la vista del cliente; cargar 40 mensajes mediante paginación; guardar/previsualizar un borrador de correo; avanzar en la demostración de formularios con advertencias por campos vacíos. Revisión a 390 × 844 sin desbordamiento horizontal, campos de 16 px e historial móvil con scroll independiente. [Captura del editor local](proofs/correos-editor-demo-20261019.jpg) y [ticket móvil ficticio](proofs/tickets-movil-demo-20261019.jpg).

### Repetir la demo sin datos reales

Desde `portal-abogados/`:

```bash
pnpm test
pnpm check
pnpm exec wrangler types --env-interface=CloudflareEnv --check
pnpm exec wrangler deploy --dry-run
pnpm exec tsx tools/preview-support.ts --local-fixture
```

La última orden abre `http://127.0.0.1:3008/`, únicamente en loopback. Usa una base efímera, secretos de prueba y usuarios `.test`; bloquea OAuth externo. Las escrituras de la demo se pierden al reiniciar. Detener con Ctrl+C y **no desplegar esta herramienta**.

### Ruta de aceptación

1. `/soporte/`: FAQ/contacto antes del formulario; completar un ticket, seleccionar solo un caso autorizado, comprobar errores y ausencia de duplicado al reintentar. Sin sesión no se accede a hilos.
2. `/admin/#tickets`: buscar con y sin tildes; combinar filtros y cargar páginas. Asignar un administrador activo, cambiar prioridad y responder. Ver autor, fecha y aviso; probar cierre/reapertura.
3. Crear una nota interna en local y abrir la sesión del usuario: la nota debe estar ausente tanto del DOM como de la respuesta API. Cargar más de 20 mensajes hasta el inicio del hilo; controles y editor deben seguir utilizables a zoom alto y en móvil.
4. Abrir dos editores del mismo ticket: el segundo no debe sobrescribir una versión desactualizada. Repetir el mismo identificador de petición no debe duplicar respuesta/alerta. Tras un guardado exitoso, un fallo al recargar no debe presentarse como guardado fallido.
5. `/admin/correos/`: guardar borrador, previsualizar datos ficticios y recuperar una versión. Probar variables desconocidas, HTML peligroso y enlaces externos. Un administrador no propietario no publica; el propietario confirma. En todos los casos, **cero correos enviados**.
6. `/admin/#tipos-casos`: cargar un ejemplo actualizado sin guardar, editar fuentes y preguntas; agregar/quitar/reordenar etapas, probar límites y vista previa. Descartar los cambios de prueba. No se deben crear casos ni perder personalizaciones existentes.
7. Escritorio, 320/390 px y zoom: sin overflow horizontal, campos de 16 px, foco visible y sidebar/historial desplazables. Verificar en iPhone físico el teclado y autozoom, sin bloquear el zoom manual.
8. Producción: comprobaciones públicas y lectura administrativa únicamente. No crear tickets/casos/cuentas ficticios, cambiar roles, publicar plantillas o enviar correos reales solo para comprobar el despliegue.

## 4. Despliegue y trazabilidad

**Desplegado y verificado el 19 de octubre de 2026, aproximadamente a las 21:16 de Santiago.** El código de esta entrega está en GitHub y Cloudflare. La comprobación autenticada se hizo en pestañas nuevas, sin recargar la pestaña original del usuario ni modificar contenido real.

| Control | Registro de cierre |
| --- | --- |
| Worker/base | Exclusivamente `jurisconecta` / `jurisconecta-db` (`106131c9-81eb-49de-9418-421ccc172576`) |
| Migraciones nuevas | Aplicadas individualmente: `0019_support_operations.sql` (34 consultas) y `0020_email_templates.sql` (3 consultas). Las seis tablas nuevas están presentes; `PRAGMA foreign_key_check` sin errores. No repetirlas. |
| Catálogo | Sin migración masiva ni sobrescritura de formularios personalizados |
| Bookmark previo | `000001e8-00000000-0000510a-73dc1c2d04308f1093032831e154f9d2` |
| Bookmark tras 0020 | `000001e9-00000010-0000510a-e827715303ff4f5afec92dd66f43779b` |
| Bookmark tras verificación | `000001e9-00000014-0000510a-c30ef1e2f712860adebe4f521efd76d9` |
| Invariantes antes/después | 4 cuentas, 3 perfiles de abogado, 1 caso, 1.676 créditos, 0 tickets/mensajes. Modo `free`, mantenimiento `0`; subida documental sigue `false`. No se cambiaron roles ni saldos. |
| Versión Worker | `b11f2c94-e260-432e-9f40-3751fc0eedb6`; startup medido por el despliegue: 15 ms. Dominios exclusivamente JurisConecta. |
| Código en GitHub | [`62f1a1a`](https://github.com/gprecabarren/jurisconecta/commit/62f1a1a), rama `codex/mvp-inicial`. El commit documental que contiene este cierre registra la verificación posterior. |
| Comprobaciones públicas/privadas | 11 comprobaciones HTTP, 0 fallos; editor y bandeja autenticados cargaron en Chrome sin errores de consola observados. |

En producción: inicio, soporte, salud, sitemap y robots respondieron 200. El catálogo completo devolvió 78 tipos con ficha editorial y el resumen 78 tarjetas sin preguntas/referencias. Las APIs de tickets/plantillas rechazaron acceso anónimo con 401 y `no-store`/`noindex`; `/admin/correos/` redirigió a GitHub con las mismas protecciones. El sitemap no incluye administración.

En Chrome se comprobaron las 12 plantillas predeterminadas y «Probar sin enviar» con datos ficticios; la bandeja mostró cero tickets y los filtros/responsable correctos. No se guardaron ni publicaron plantillas reales: las tablas de plantillas/versiones permanecieron vacías y los ejemplos se sirven como valores iniciales editables. No se crearon tickets/casos/cuentas de prueba en producción ni se enviaron emails. Las capturas adjuntas son de la demo local; la captura de pantalla de producción no estuvo disponible, aunque sí se verificó el contenido y la vista previa mediante la interfaz.

No ejecutar `wrangler d1 migrations apply --remote` en bloque: las migraciones históricas se aplicaron manualmente y el registro del CLI no representa el esquema remoto real. Antes de modificar la base, comprobar esquema, cuenta/base exactas y bookmark de recuperación disponible. Aplicar solo los archivos nuevos necesarios y conservar los datos reales. Un rollback del Worker no revierte automáticamente el esquema; las dos migraciones son aditivas.

## 5. Pendientes y orden recomendado

1. Revisión humana de los 78 recorridos, términos/privacidad, consentimiento y retención. Ajustar los formularios en administración con cambios explícitos y auditados.
2. Definir responsables, prioridades y tiempos de atención reales de soporte; ensayar usuario/abogado/administrador y respuestas públicas versus notas internas. No hay adjuntos ni automatización de escalados/SLA.
3. Elegir un transporte de email **realmente gratuito**, verificar condiciones/cuotas y remitente; conectar eventos con entrega idempotente, reintentos, registro minimizado, bajas/preferencias y pruebas de recuperación. Las plantillas por sí solas no resuelven entregabilidad ni recepción de respuestas.
4. Completar antispam del registro/login por contraseña, revisión de seguridad independiente y ensayo autorizado de restauración D1; vigilar cuotas Free y revisar datos demo preexistentes antes de captar casos reales.
5. Mejorar hitos de causas ingresados por el abogado, mensajería autorizada dentro del caso, moderación y asignación por especialidad/zona. El panel cliente actual no es un expediente judicial sincronizado.
6. Continuar contenido editorial original por materia, revisión de indexación y configuración gratuita de Semrush; sin prometer posiciones ni copiar textos de competidores.

El cronograma de tres semanas sigue condicionado a revisión legal y aceptación: **20–26 de octubre**, validación jurídica/operativa y móvil; **27 de octubre–3 de noviembre**, seguridad, recuperación, cuotas y piloto cerrado. Pagos y notificaciones externas requieren decisiones e integración adicionales; no forman parte de una promesa de lanzamiento comercial en esa fecha.

Antecedentes: [estado general](../README.md), [roles y catálogo, 15 de octubre](ROLES-CATALOGO-SOLICITUDES-2026-10-15.md), [planes y colaboraciones, 13 de octubre](PLANES-CREDITOS-ALIADOS-2026-10-13.md).
