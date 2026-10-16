# Roles exclusivos y solicitudes antes del registro

Entrega del **15 de octubre de 2026**, exclusivamente para JurisConecta. No se modificó Chile3X ni se habilitaron pagos, R2, correo transaccional o proveedores nuevos.

## Qué cambió

### Una cuenta, un rol

`users.role` ya era un valor único. Se reforzó la exclusividad del correo normalizado (sin espacios exteriores y sin distinguir mayúsculas) en los registros por contraseña, Google y SQL, también con solicitudes concurrentes. No se fusionaron ni borraron cuentas heredadas.

En [Todas las cuentas](https://jurisconecta.cl/admin/#usuarios), abrir una cuenta y usar el cambio cliente/abogado. Exige rol/versión vigentes, correo exacto y confirmación de las consecuencias. Se actualiza el rol, aumenta la versión de sesión, revoca **todos los dispositivos** y registra responsable/fecha en la bitácora, dentro de una transacción atómica. No permite convertir a administrador.

Los casos, propuestas y saldos anteriores se conservan como historia. La persona deja de acceder a las rutas y casos de su rol anterior; volver al rol original permite usar los datos correspondientes, no genera una segunda cuenta. Pasar a abogado crea solo un perfil borrador sin aprobación ni créditos si no existía; una suspensión nunca se levanta por cambiar el rol. Un perfil histórico aprobado conserva sus antecedentes, sin recarga automática por la conversión.

También se impide proponer o acceder como abogado a los antiguos casos propios. Aprobar una postulación y aceptar una propuesta comprueban rol/estado vigente dentro de sus transacciones: no se puede aprobar como abogado una cuenta convertida a cliente ni aceptar nuevas propuestas de un abogado convertido/suspendido. No se eliminan relaciones históricas ni se reasignan casos automáticamente.

### Catálogo y formularios editables

El home muestra **18 tarjetas: 3 filas y 6 columnas en escritorio**, con «Ver más casos» para los **78 tipos** de las referencias, sin duplicados. En pantallas menores se adapta a 3, 2 o 1 columnas. Los iconos son de Lucide, coherentes con JurisConecta; no se extrajeron archivos gráficos del sitio ajeno. Se corrigió el texto erróneo de automóviles/motocicletas en el catálogo nuevo, sin renombrar casos históricos.

Cada tipo tiene tres etapas iniciales y seis preguntas: dos específicas del asunto, antecedentes/urgencia generales y objetivo/contexto opcional. Se evitan relatos íntimos, identificadores de terceros, documentos, claves y datos bancarios. Son formularios editoriales de orientación, no asesoría jurídica ni promesas de resultado; necesitan revisión profesional antes de un lanzamiento abierto.

[Casos y formularios](https://jurisconecta.cl/admin/#tipos-casos) permite agregar/editar/ocultar tipos, nombre, categoría, icono, descripción y orden; editar, ordenar, agregar o quitar etapas; y definir preguntas de texto, párrafo, selector, fecha o número, opciones, obligatoriedad y tamaño máximo. Hasta **120 tipos**, **5 etapas**, **20 preguntas** y 24 KB de esquema por tipo. El área debe mantenerse coherente con las especialidades profesionales existentes: crear una categoría nueva por texto no amplía por sí solo el catálogo de especialidades del abogado.

La vista previa usa los **mismos campos, contacto y validaciones** que el cliente. Los cambios locales aparecen sin guardar; la demostración permite seguir con campos vacíos mostrando avisos y no crea cuentas/casos ni inicia OAuth. Guardar publica una versión nueva y una entrada de bitácora; una edición concurrente se rechaza. Desmarcar «Publicado» oculta el tipo sin borrar su historia. Los borradores ya iniciados conservan el esquema con el que comenzaron; un tipo retirado no admite el envío final.

## Recorrido y guardado

1. Desde el home, elegir un caso abre `/solicitar/?tipo=…` **sin exigir cuenta**. El antiguo `/publicar-caso` redirige a este recorrido; `/encuentra-abogado` también permite comenzar sin registro.
2. Responder las etapas específicas. «Guardar y continuar» persiste cada avance; «Guardar borrador» permite guardado manual. Los campos modificados pero no guardados se advierten antes de salir. No se promete guardar cada pulsación.
3. Completar nombre, teléfono, región, comuna y modalidad de atención. El contacto no se añade a los antecedentes que ven los abogados.
4. Al final, crear o abrir una cuenta **de cliente**, verificar el correo y regresar al borrador. Google confirma el correo; las cuentas con contraseña deben vincular la misma dirección. Una cuenta profesional no puede publicar solicitudes de cliente con ese mismo rol.
5. Revisar y confirmar el envío. Requiere sesión cliente vigente y correo verificado también en servidor; la ruta clásica de creación no permite evitar esta comprobación. La transacción crea caso, detalles y snapshot de preguntas/respuestas, consume el borrador y conserva el costo de créditos configurado. Reintentar o enviar simultáneamente devuelve el mismo caso, no duplicados.
6. El panel cliente muestra la solicitud y sus propuestas/hitos de plataforma. Solo el abogado aceptado podrá desbloquear contacto; no se promete que tres abogados contacten directamente sin aceptación.

El borrador se cifra con **AES-GCM**, IV aleatorio y clave derivada del secreto existente. Su cookie es aleatoria de 256 bits, HttpOnly/Secure/SameSite=Lax; en D1 se guarda solo el hash de esa capacidad. No hay texto del caso en localStorage, URLs ni eventos de analítica. Al ingresar como cliente queda vinculado a esa cuenta; otra cuenta o un navegador sin cookie no lo recuperan. Los datos de contacto permanecen cifrados hasta el envío.

Se puede recuperar durante **48 horas**, no indefinidamente ni desde cualquier dispositivo. Hay límites de 200 borradores/8 MB codificados, 5 altas por IP/hora y 60 guardados/hora para acotar abuso/consumo. Vencido, no se puede recuperar ni enviar; la limpieza física de filas expiradas se realiza al crear nuevos borradores, no mediante un cron de borrado puntual. Al publicar se elimina el payload temporal cifrado y se conservan los datos en el caso/snapshot asociados a la cuenta. La página de formulario es privada/no-store, noindex/noarchive y no se instrumenta con GTM.

### Verificación de correo: límite real

**Está conectada la verificación de Google; no el envío de códigos a cualquier correo.** La documentación vigente de [Cloudflare Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) exige Workers Paid para enviar a destinatarios arbitrarios. No se contrató ese plan ni se enviaron códigos ficticios. La cuenta Google puede usar su dirección verificada; una cuenta por contraseña debe vincular exactamente el mismo correo. Si no dispone de esa vía, no puede publicar hasta habilitar una alternativa real.

Queda pendiente la explicación adicional del usuario sobre el registro final. Una opción futura sería un proveedor gratuito con límites duros y confirmación de dominio, pero requiere elegir/configurar proveedor y revisar sus condiciones; no se activó automáticamente. No existe un panel para marcar arbitrariamente un correo como verificado ni para saltarse la comprobación.

## Verificación y despliegue

- **62/62 pruebas**: rol único, normalización de correo, sesiones, CAS/auditoría, cambio de rol durante aprobación/aceptación, snapshots, cifrado/propiedad/vencimiento, guardado, catálogo, concurrencia, envío único, verificación obligatoria y contacto protegido.
- OAuth completo simulado con firma RSA/JWKS local y red mock: inicio → callback → registro temporal → términos → regreso al mismo borrador. No se usó Google real, cuentas reales ni correos externos para las pruebas.
- TypeScript, ESLint, build estático de **34 rutas**, tipos Wrangler y dry run aprobados. No equivale a una auditoría independiente ni a una prueba en Safari físico.
- Chrome local: 18 tarjetas/6 columnas/3 filas, expansión a 78, inversión extranjera sin cuenta, guardado/recarga, contacto al final, cliente ficticio verificado y envío hasta su panel. La preview refleja cambios de título y avanza con campos vacíos. A 390 px no hay desbordamiento del formulario; se corrigió la superposición del menú móvil del panel cliente con un botón plegable reutilizando los estilos existentes.
- Producción: catálogo 200 con 78 tipos, formulario 200 con encabezados private/no-store/noindex y sin inyección GTM; API admin 401 sin sesión; método no permitido 405 en envío por GET. El editor administrativo autenticado cargó en Chrome, sin guardar cambios de rol/contenido reales.

Mismo Worker **`jurisconecta`**, D1 **`jurisconecta-db`** (`106131c9-81eb-49de-9418-421ccc172576`), cuenta `4ea4b93b4874da271a0116bd4728f282`. Aplicadas **solo 0016, 0017 y 0018**, ya probadas en memoria; no repetirlas ni ejecutar las migraciones históricas en bloque. Antes y después: **4 cuentas, 1 cliente, 3 abogados, 1.676 créditos, modo free**; no se modificaron roles de personas reales, no se crearon casos ficticios ni logos en producción y no se añadieron bindings/servicios.

Bookmark previo `0000015f-00000000-00005106-820fd04f795d2cdd6215eefae709355a`; posterior `00000160-00000012-00005106-e3885489d84f3034eaf1fe4fb09882e4`. Son referencias temporales de recuperación, no un backup permanente. Versión final Cloudflare **`bd794eac-14bd-4d86-917c-5d17861e2032`**, dominios `jurisconecta.cl` y `www.jurisconecta.cl`, arranque informado 15 ms.

Evidencias con datos exclusivamente ficticios: [registro al final](proofs/intake-final-demo-20261015.png), [editor](proofs/admin-intake-preview-demo-20261015.png), [caso enviado y menú móvil](proofs/client-intake-mobile-demo-20261015.png).

## Cómo repetir y qué sigue

`pnpm check` y `pnpm test`. Para demo aislada: `pnpm exec tsx tests/visual-server.ts --intake-demo`, abrir `http://127.0.0.1:3008/`, recorrer un caso y recargar. La ruta **solo local** `/__fixture/customer` simula el retorno de un cliente verificado sin proveedor externo. La base es SQLite en memoria y OAuth está bloqueado; reiniciar borra la demo. Detener con Ctrl+C, nunca desplegar el fixture ni sus credenciales falsas.

Siguiente trabajo: definir la variante final del registro/verificación, revisión profesional de las 78 preguntas y categorías, recorrido real de Google en cuenta ficticia controlada (con aceptación humana de términos), Safari/iPhone, pruebas de soporte/roles y revisión legal/retención. Continúan los pendientes anteriores: antispam de contraseña, textos legales aprobados, seguridad independiente, recuperación/backup, hitos y comunicación dentro del caso, logos reales y seguimiento SEO/Semrush gratuito. Pagos, códigos de email, WhatsApp y expedientes judiciales sincronizados siguen sin conectarse.

Se mantiene la hoja de ruta **13 octubre–3 noviembre** para un piloto cauteloso, no para afirmar un producto comercial terminado: primera semana pruebas/seguridad y registro; segunda revisión legal, hitos/comunicación y contenido; tercera restauración, rendimiento e incidencias de piloto. Condicionada a decisiones del registro y revisión jurídica; no autoriza servicios de pago.
