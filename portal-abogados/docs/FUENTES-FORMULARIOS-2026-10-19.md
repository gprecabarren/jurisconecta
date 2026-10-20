# Formularios de casos: ejemplos y fuentes oficiales

Consulta editorial: **19 de octubre de 2026**. Alcance: JurisConecta; no se modificó Chile3X ni se contrató un servicio.

## Qué se incorporó

- Los **78 tipos** tienen un ejemplo ficticio propio y un recorrido de tres etapas. Cada uno incluye cuatro preguntas específicas del asunto, además de preguntas generales sobre disponibilidad de antecedentes, comunicaciones próximas y el apoyo buscado.
- Las dos preguntas específicas adicionales son opcionales. La persona no necesita conocer una calificación jurídica ni exhibir documentos para empezar.
- Los ejemplos se basan en las materias, etapas y antecedentes descritos por las instituciones oficiales enlazadas. **Son herramientas de recopilación inicial, no un dictamen sobre derechos, requisitos, competencia, estrategia, sanciones o plazos.**
- No se calcula prescripción/caducidad, no se garantiza un resultado y no se afirma que todas las gestiones requieran contratar un abogado. Las fuentes de posesión efectiva intestada y renegociación, por ejemplo, explican vías que pueden realizarse sin abogado.
- Las referencias no certifican que se haya realizado una revisión jurídica profesional: la nota visible en el editor mantiene expresamente **revisión jurídica humana pendiente**. Hay que revisar especialmente reformas y reglas transitorias sobre adopción, apoyos/capacidad, planes de salud, protección de datos y procedimientos.
- En materias de abuso, violencia, menores y derechos humanos se evita pedir relatos gráficos, diagnósticos, identidades y ubicación de terceros. Se permite reservar detalles para una conversación privada. Se advierte que la plataforma no es una denuncia formal ni un canal de emergencia.

## Edición y demostración en administrador

En `/admin/#tipos-casos` se puede agregar, editar, eliminar y reordenar etapas y preguntas. Se conserva al menos una etapa y una pregunta por etapa para no publicar recorridos vacíos; límites: cinco etapas y veinte preguntas.

Las preguntas ahora tienen controles de subir/bajar y confirmación antes de quitarlas. La vista previa usa el componente real del sitio, refleja los cambios locales inmediatamente, muestra los errores y permite avanzar sin enviar datos. Se advierte al cerrar una pestaña con cambios no guardados.

Cada ficha editorial permite modificar fecha, nota, ejemplo y entre una y seis fuentes. Se validan tamaños, ausencia de HTML y direcciones HTTPS de organismos oficiales; se rechazan dominios parecidos, credenciales embebidas, puertos alternativos, esquemas ejecutables y fuentes repetidas.

**Cargar ejemplo actualizado** copia las etapas, preguntas y referencias al borrador local del editor, previa confirmación. No guarda automáticamente, no modifica el nombre/orden/publicación del tipo y no sobrescribe formularios personalizados sin una acción explícita. **Guardar formulario** conserva el control de versión concurrente y la bitácora.

Si el guardado se confirma y falla la actualización posterior de la lista, se informa que el formulario sí se guardó: no se pide repetir una escritura exitosa.

## Conservación de datos y despliegue

- No hay migración ni actualización masiva de `case_type_catalog` para esta mejora.
- Los valores predeterminados del código se aplican a tipos sin una definición personalizada en D1. Los registros guardados por un administrador mantienen sus preguntas exactas, incluso si no tienen metadatos editoriales.
- Una versión guardada solo cambia por una nueva edición explícita y auditada. Los borradores de clientes y casos enviados conservan el esquema original almacenado; no se reinterpretan respuestas antiguas con las preguntas nuevas.
- No se envían respuestas de ejemplo, no se crean solicitudes reales y no se incluyen datos personales reales en las fichas.
- La parte administrativa sigue siendo privada y no se crea una página SEO indexable con datos de casos. Los controles editables mantienen tamaño de letra de 16 px, áreas táctiles y distribución de una columna en móvil.

## Fuentes consultadas

Los identificadores de esta tabla se usan en la cobertura posterior. Los enlaces completos están también en `shared/case-intake-guidance.ts` y en el editor de cada caso.

| ID | Fuente oficial |
| --- | --- |
| CIV | [BCN: Código Civil](https://www.bcn.cl/leychile/navegar?idNorma=172986) |
| LAB | [BCN: Código del Trabajo](https://www.bcn.cl/leychile/navegar?idNorma=207436) |
| PEN | [BCN: Código Penal](https://www.bcn.cl/leychile/navegar?idNorma=1984) |
| FAM | [ChileAtiende: mediación familiar](https://www.chileatiende.gob.cl/fichas/2344-mediacion-familiar-previa-y-obligatoria) |
| HER | [ChileAtiende: posesión efectiva sin testamento](https://www.chileatiende.gob.cl/fichas/ver/3364) |
| NOM | [ChileAtiende: cambio de nombre y rectificación](https://www.chileatiende.gob.cl/fichas/3379-) |
| ADO | [ChileAtiende: asesoría jurídica para adopción](https://www.chileatiende.gob.cl/fichas/76231/1/pdf) |
| MIG | [SERMIG: residencia temporal](https://serviciomigraciones.cl/residencia-temporal/) |
| DEN | [Fiscalía: canales formales de denuncia](https://www.fiscaliadechile.cl/victimas-y-testigos/adultos/como-puedo-denunciar) |
| NNA | [Fiscalía: víctimas niños, niñas y adolescentes](https://www.fiscaliadechile.cl/victimas-y-testigos/ninos/inicio) |
| DDH | [INDH: denuncia de posibles vulneraciones estatales](https://www.indh.cl/hacer-una-denuncia/) |
| CON | [SERNAC: reclamo contra una empresa](https://www.sernac.cl/portal/617/w3-article-9178.html) |
| GAR | [SERNAC: garantía legal](https://www.sernac.cl/portal/604/w3-propertyvalue-8062.html) |
| SAL | [Superintendencia de Salud: reclamos](https://www.superdesalud.gob.cl/tax-temas-de-orientacion/reclamo-2414/) |
| MED | [Superintendencia de Salud: mediación en salud](https://www.superdesalud.gob.cl/mediacion-en-salud/) |
| LIC | [SUSESO: reclamación por licencias médicas](https://www.suseso.cl/622/w3-propertyvalue-788701.html) |
| ACC | [SUSESO: discusión del origen común o laboral](https://www.suseso.cl/606/w3-propertyvalue-34943.html) |
| KAR | [Dirección del Trabajo: denuncia laboral y Ley Karin](https://www.dt.gob.cl/portal/1628/w3-article-126464.html) |
| INS | [SUPERIR: renegociación](https://www.superir.gob.cl/renegociacion/) |
| MAR | [INAPI: preguntas frecuentes sobre marcas](https://inapi.cl/preguntas-frecuentes/marcas) |
| PIN | [INAPI: compilación de normas de propiedad industrial e intelectual](https://www.inapi.cl/docs/default-source/default-document-library/compilacion-de-normas-relativas-a-la-propiedad-intelectual.pdf?sfvrsn=4f911e85_0) |
| EMP | [InvestChile: instalación de una empresa en Chile](https://tools.investchile.gob.cl/es/como-invertir-en-chile/como-instalar-una-empresa-en-chile) |
| INV | [InvestChile: herramientas para inversionistas](https://www.investchile.gob.cl/es/herramientas-para-inversionistas/) |
| TRI | [SII: inicio de actividades y cumplimiento tributario](https://www.sii.cl/destacados/ley_cumplimiento_obligaciones_tributarias/inicio_actividades.html) |
| TTA | [Tribunales Tributarios y Aduaneros: reclamaciones tributarias](https://www.tta.cl/procedimiento-general-de-reclamaciones-tributarias/) |
| ADU | [Tribunales Tributarios y Aduaneros: reclamaciones aduaneras](https://www.tta.cl/procedimiento-general-de-reclamaciones-aduaneras/) |
| DOC | [Aduanas: compendio, ingreso de mercancías](https://www.aduana.cl/aduana/site/docs/20070228/20070228014536/1.pdf) |
| AMB | [SEA: evaluación de impacto ambiental](https://www.sea.gob.cl/evaluacion-de-impacto-ambiental) |
| FIN | [CMF: atención ciudadana y reclamos](https://www.cmfchile.cl/portal/principal/623/w4-propertyname-904.html) |
| SEG | [CMF: consultas y reclamos de seguros](https://www.cmfchile.cl/educa/621/w3-article-1752.html) |
| MAS | [BCN: Ley 21.020 sobre tenencia responsable](https://www.bcn.cl/leychile/navegar?idLey=21020) |
| COP | [BCN: Ley 21.442 de copropiedad inmobiliaria](https://www.bcn.cl/leychile/navegar?idNorma=1174663) |

Las normas completas y compilaciones sirven como marco de clasificación, no como un certificado de actualización permanente. Una fuente sobre un canal de reclamo tampoco significa que ese organismo sea competente para todas las variantes de un caso. El profesional debe verificar la versión normativa aplicable y los antecedentes antes de recomendar una vía.

## Cobertura de los 78 casos

Todos cuentan con un escenario ficticio propio y opciones específicas en el código/editor. La columna central resume los dos antecedentes añadidos; se suman a las dos preguntas temáticas que ya existían.

| N.º | Tipo | Antecedentes específicos añadidos | Fuentes |
| --- | --- | --- | --- |
| 1 | Pensión alimenticia | Mediación previa; gastos, ingresos, liquidación o resolución | FAM, CIV |
| 2 | Inmigración en Chile | Lugar de gestión; permiso, comprobante o requerimiento | MIG |
| 3 | Divorcio | Cese de convivencia; materias familiares y patrimoniales | CIV, FAM |
| 4 | Herencias y posesiones efectivas | Testamento; certificados, inventario o posesión efectiva | HER, CIV |
| 5 | Deudas y embargos | Tipo de comunicación; monto, pagos o bienes afectados | CIV, INS |
| 6 | Compra y arriendo de propiedades | Posición en la operación; títulos, contrato o restitución | CIV |
| 7 | Accidentes de tránsito | Consecuencia general sin detalles clínicos; procedimiento o seguro | PEN, SEG |
| 8 | Abuso sexual y violación | Acompañamiento de menores sin identificarlos; resguardo privado | DEN, NNA |
| 9 | Tuición | Mediación; cambios generales de cuidados o protección | FAM, CIV |
| 10 | Juicio o reconocimiento de paternidad | Antecedente registral o judicial; minoría de edad sin identificación | CIV, NNA |
| 11 | Régimen de visitas | Mediación; horarios, vacaciones, modalidad o cumplimiento | FAM, CIV |
| 12 | Defensa de derechos laborales | Documentación del vínculo; jornada, pagos o actuaciones | LAB, KAR |
| 13 | Despido injustificado | Estado del finiquito; causal, pagos, cotizaciones o protección | LAB |
| 14 | Robos y hurtos | Situación general del bien; denuncia, citación o respaldo | DEN, PEN |
| 15 | Violencia intrafamiliar | Medidas existentes; contacto seguro y representación | DEN, FAM |
| 16 | Manejo en estado de ebriedad | Documentos procesales; revisión de licencia de conducir | PEN |
| 17 | Injurias y calumnias | Respaldo conservado en privado; alcance de comunicación | PEN, CIV |
| 18 | Tráfico de drogas | Antecedentes procesales; audiencia, cautelares o resolución | PEN |
| 19 | Negligencia médica | Prestador público/privado; existencia de mediación | MED, SAL |
| 20 | Estafas y delitos económicos | Medio de la operación; comprobante o respaldo general | DEN, FIN |
| 21 | Problemas entre vecinos | Régimen del inmueble; reglamento, acta o reclamo | COP, CIV |
| 22 | Pago de honorarios | Forma de remuneración; respaldo de cumplimiento o cobro | CIV |
| 23 | Recurso de protección contra alza en Isapres | Documento del plan; concepto del cambio sin presumir vía judicial | SAL |
| 24 | Mascotas | Vínculo con animal; registro, comunicación o reclamo | MAS, CIV |
| 25 | Otros casos civiles | Vínculo civil; respaldo de acuerdo, bien o comunicación | CIV |
| 26 | Cambio de nombre | Antecedente registral; lugar de inscripción | NOM, CIV |
| 27 | Declaración de interdicción | Apoyo para decisiones; poder o resolución, sin diagnosticar incapacidad | CIV |
| 28 | Adopciones | Ámbito nacional/internacional; antecedente institucional | ADO, NNA |
| 29 | Otros casos de familia | Ámbito familiar; acuerdo, mediación o resolución | CIV, FAM |
| 30 | Licencia médica | Entidad que respondió; resolución, reclamación o subsidio | LIC |
| 31 | Accidentes laborales | Trabajo, trayecto u origen por determinar; DIAT/DIEP o calificación | ACC, LAB |
| 32 | Acoso sexual | Investigación o resguardo; gestión a revisar sin relato íntimo | KAR, DEN |
| 33 | Autodespido | Comunicación de término; respaldo laboral sin recomendar terminar | LAB |
| 34 | Constitución y asesoría de sindicatos | Estatutos o actas; ámbito organizacional | LAB |
| 35 | Negociación colectiva | Instrumento previo; proyecto, respuesta o acta | LAB |
| 36 | Otros casos laborales | Vínculo; actuación empresarial, administrativa o judicial | LAB |
| 37 | Agresiones y riñas | Antecedente formal; gestión o audiencia sin relato gráfico | DEN, PEN |
| 38 | Homicidios | Antecedente procesal; foco de representación | DEN, PEN |
| 39 | Discriminación y delitos de odio | Acto general; respaldo sin pedir categorías sensibles | DEN, CIV, KAR |
| 40 | Amenazas y extorsiones (chantajes) | Protección y contacto; respaldo conservado en privado | DEN, PEN |
| 41 | Delitos informáticos | Activo digital; resguardo o reporte, sin claves ni registros privados | DEN, FIN |
| 42 | Otros casos penales | Posición en la causa; denuncia, citación o resolución | DEN, PEN |
| 43 | Insolvencia y quiebras | Antecedente concursal; objetivo sin evaluar elegibilidad automáticamente | INS |
| 44 | Marcas, patentes y propiedad intelectual | Estado del derecho; observación, licencia o registro | MAR, PIN |
| 45 | Constitución de sociedad | Estructura de participación; estatutos, aportes o actividad | EMP, TRI |
| 46 | Redacción o revisión de contratos | Relación contractual; pagos, término, responsabilidades o datos | CIV |
| 47 | Litigio y arbitrajes | Convenio arbitral; antecedentes de controversia | CIV |
| 48 | Inversión extranjera | Forma de instalación; representación, registros o permisos | INV, EMP, TRI |
| 49 | Importaciones, exportaciones y derecho aduanero | Actuación/documento aduanero; estado de gestión | ADU, DOC |
| 50 | Recursos naturales y medioambientales | Vínculo con proyecto; pertinencia, DIA/EIA, RCA o reclamación | AMB |
| 51 | Mercado de capitales | Posición; contrato, intermediario o requerimiento | FIN |
| 52 | Otros casos comerciales | Actividad comercial; estatutos, contrato o requerimiento | CIV, EMP |
| 53 | Planificación tributaria | Operación/actividad; antecedentes de formalización o declaración | TRI |
| 54 | Litigios tributarios | Actuación recibida; estado administrativo/judicial | TTA, TRI |
| 55 | Otros casos tributarios | Materia tributaria; requerimiento, resolución o comprobante | TRI, TTA |
| 56 | Inmobiliarias y constructoras | Estado de entrega; contrato, acta o respuesta sobre defectos | CON, CIV |
| 57 | Bancos, AFPs y empresas financieras | Tipo de entidad; respaldo sin números de cuenta ni claves | CON, FIN |
| 58 | Aseguradoras | Etapa del siniestro; póliza, liquidación o respuesta | SEG |
| 59 | Transporte | Canal de contratación; reserva, aviso, equipaje o respuesta | CON |
| 60 | Tiendas comerciales y retail | Comprobante; respuesta del proveedor sin prometer garantía aplicable | GAR, CON |
| 61 | Entretención y turismo | Cambio/incumplimiento; reserva, términos o respuesta | CON |
| 62 | Comercio electrónico | Respaldo digital; estado de entrega/devolución | CON, GAR |
| 63 | Automóviles y motocicletas | Estado del vehículo; contrato, orden o respuesta del proveedor | CON, GAR |
| 64 | Salud (hospitales, clínicas, etc.) | Entidad; documento no clínico y reclamo | SAL, CON |
| 65 | Educación | Contratación; estado del servicio sin datos de estudiantes menores | CON |
| 66 | Servicios básicos (agua, luz, electricidad) | Respaldo de suministro; afectación individual o común | CON |
| 67 | Telecomunicaciones | Contrato, término o reclamo; estado del servicio | CON |
| 68 | Otros casos de protección al consumidor | Relación de consumo; respaldo de contratación o respuesta | CON |
| 69 | Detención ilegal por parte del Estado | Antecedente general; canales de protección y revisión | DDH, DEN |
| 70 | Lesiones por parte del Estado | Organismo interviniente; respaldo sin detalles de lesiones | DDH, DEN |
| 71 | Torturas por parte del Estado | Canal institucional; contacto seguro y acompañamiento | DDH, DEN |
| 72 | Adopciones irregulares por parte del Estado | Antecedente registral; investigación, identidad o procedimiento | DDH, ADO |
| 73 | Secuestro por parte del Estado | Canal formal; antecedente de seguimiento | DDH, DEN |
| 74 | Sustracción de menores por parte del Estado | Antecedente institucional; protección o búsqueda sin identidades | DDH, NNA |
| 75 | Violencia sexual por parte del Estado | Acompañamiento institucional; resguardo sin relato íntimo | DDH, DEN, NNA |
| 76 | Homicidio por parte del Estado | Organismo interviniente; antecedente de investigación o resolución | DDH, DEN |
| 77 | Otros casos de violación a los derechos humanos | Actuación estatal; canal de protección | DDH, DEN |
| 78 | Otro tipo de caso | Relación general; antecedente para clasificar sin exponer contenido privado | CIV |

## Pruebas y ruta de revisión

Pruebas locales específicas: `pnpm exec tsx --test tests/case-types.test.ts tests/intake.test.ts` (**19/19** al completar esta mejora), `pnpm run typecheck` y ESLint de los archivos modificados. Las dos pruebas adicionales de `tests/catalog-summary.test.ts` comprueban que el home conserva identificadores e iconos, pero no descarga las preguntas ni las referencias completas.

Se comprueba cobertura exacta de 78 tipos, unicidad de ejemplos e identificadores, validación de todos los formularios, respuestas mínimas válidas, cotas de tamaño, enlaces oficiales seguros y rechazo de metadatos maliciosos. También se comprueba que un formulario personalizado antiguo no se sustituye por el ejemplo, que una edición explícita conserva el control de versión y que el intake mantiene los esquemas originales al editar el catálogo.

Revisión manual recomendada antes de captar casos reales:

1. Abrir `/admin/#tipos-casos`, seleccionar un tipo sin guardar cambios reales y recorrer el escenario ficticio.
2. Agregar, modificar, reordenar y eliminar preguntas/etapas en el editor; comprobar la misma estructura en la demostración.
3. Cargar el ejemplo actualizado, cancelar o confirmar su carga local y revisar que no se publica hasta guardar.
4. Comprobar móvil de 390 px, escritorio y zoom de 200 %; navegar con teclado y probar las confirmaciones.
5. Solicitar revisión de un abogado chileno de cada familia jurídica. Actualizar fuentes y nota después de esa revisión; no marcar validación profesional por el solo hecho de cargar el ejemplo.
6. Probar con una cuenta ficticia: iniciar borrador, cambiar el tipo desde administrador y confirmar que el borrador inicial conserva sus preguntas; no usar casos reales para esta prueba.

Este documento informa el cambio de formularios. Los resultados finales de integración, despliegue y commit los registra el informe general de la entrega.
