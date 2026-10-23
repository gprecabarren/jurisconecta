# Buscador público y palabras clave administrables — 23 de octubre de 2026

## Cambios

- La zona «Primer paso» tiene mayor separación entre su descripción y el catálogo: **36–52 px**, además del espacio propio del buscador antes de las tarjetas.
- Buscador compacto visible desde el inicio, sin tener que pulsar «Ver más». Filtra los **78 tipos** disponibles, aunque inicialmente solo se muestren 18. Al limpiar restaura la vista anterior; si no hay coincidencias permite abrir el catálogo completo.
- Busca por nombre, área y palabras/frases cotidianas configuradas. Tolera tildes, mayúsculas, puntuación y comienzos de palabras. Prioriza nombres exactos y conserva el orden del catálogo en los empates. No aplica clasificación jurídica automática ni usa IA.
- Ejemplos iniciales: «golpes» → Violencia intrafamiliar y Agresiones y riñas; «me echaron» → Despido injustificado; «no me pagan» → Defensa de derechos laborales. Son alternativas orientativas, no un diagnóstico ni asesoría jurídica.
- Administrador: **Casos y formularios → seleccionar tipo → Palabras clave para el buscador del home**. Una frase por línea o separada por comas, contador y validación; incluye una prueba de búsqueda del borrador sin publicar.
- Los resultados activos se muestran inmediatamente, sin esperar el revelado de scroll. El campo mantiene etiqueta, foco visible, tamaño de letra de 16 px, botón de limpiar y anuncio de resultados para lectores de pantalla. Escape limpia y Enter no envía formularios accidentalmente.

## Persistencia y límites

`searchKeywords` se guarda en el JSON existente del tipo de caso: **sin migración ni tabla nueva**. Hasta **32 términos, 64 caracteres por término y 1600 caracteres totales**. Validación tanto en el editor como en el servidor, sin HTML ni caracteres de control/dirección invisibles; se normalizan espacios y se eliminan duplicados ignorando tildes/mayúsculas. Los límites se verifican antes de deduplicar.

Las definiciones antiguas sin este campo heredan los términos iniciales, sin sobrescribir sus preguntas, referencias, iconos, orden, estado ni versiones. `[]` explícito elimina todas las palabras clave y no vuelve a importar las iniciales. Los editores antiguos que omiten el campo conservan las palabras guardadas. Las ediciones mantienen autenticación GitHub, comprobación de origen, control de versión concurrente y auditoría atómica con usuario/fecha y valores anteriores/nuevos.

El resumen público incluye únicamente metadatos y palabras clave de tipos publicados, sin descargar sus preguntas ni referencias. **Las palabras clave son públicas**; no introducir datos de personas o casos reales. La búsqueda escrita se procesa localmente: no se añade a la URL, no se guarda en almacenamiento del navegador y no se envía como consulta a una API o servicio externo. No se añaden páginas de resultados indexables ni se modifican los metadatos SEO.

## Verificación

- **129/129 pruebas**, TypeScript, ESLint y build de **35 rutas** correctos. Trece pruebas nuevas cubren búsqueda/orden, aliases iniciales, límites, datos antiguos, borrado explícito, clientes antiguos, permisos, origen, auditoría y conflictos de versión.
- Tipos Wrangler comprobados y dry run correcto: Worker **786,63 KiB / 182,46 KiB gzip**, 406 archivos estáticos. No se añadieron dependencias ni servicios.
- Chrome local: búsquedas «golpes», término inexistente, limpiar y abrir los 78 tipos; la consulta ficticia no apareció en peticiones ni en la URL.
- Flujo real de la demo local: guardar una frase ficticia desde administración → recargar el home → encontrar el tipo; borrar todas las palabras → deja de coincidir por el alias; volver a guardar y probar la vista previa. El campo preserva comas/saltos mientras se escribe y se normaliza después de guardar. Un término de 65 caracteres produce error inline.
- Portada y editor comprobados en anchos solicitados de **320, 390, 768, 1181 y 1440 px** (área útil 15 px menor por scrollbar), sin overflow horizontal; campo y textarea de 16 px. No equivale a probar todos los dispositivos físicos ni Safari/iPhone real. Se restauró el viewport del navegador.

Evidencias de **demo local con datos ficticios**, sin escrituras de prueba en producción: [escritorio](proofs/buscador-casos-desktop-20261023.jpg), [móvil](proofs/buscador-casos-movil-20261023.jpg), [editor administrativo](proofs/buscador-casos-admin-20261023.jpg).

## Ruta de revisión

1. Abrir `/#casos`, escribir «golpes», «arriendo» o «me echaron» y comprobar alternativas.
2. Probar búsqueda vacía, sin coincidencias, limpiar con botón/Escape y «Ver más».
3. En `/admin/#tipos-casos`, seleccionar un tipo y revisar los términos iniciales. Usar «Probar búsqueda en este borrador» antes de guardar.
4. Agregar una frase pertinente y guardar; recargar el home para recibir la configuración vigente. No se necesita registrar una cuenta ni publicar un caso para probar el buscador.
5. Revisar cada asociación con un profesional; ampliar o ajustar vocabulario según consultas reales, sin almacenar consultas sensibles de visitantes.

## Publicación

Pendiente del cierre de verificación en este commit de implementación. Solo se despliega el Worker existente `jurisconecta`; no se modifica Chile3X ni ninguno de los otros proyectos. Sin pagos, migraciones, envíos de correo ni cambios masivos de formularios guardados. La actualización anterior de botones quedó publicada y documentada en [`889bee1`](https://github.com/gprecabarren/jurisconecta/commit/889bee1) / [`d713bac`](https://github.com/gprecabarren/jurisconecta/commit/d713bac).
