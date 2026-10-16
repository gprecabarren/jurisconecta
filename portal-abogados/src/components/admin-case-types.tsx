"use client";

import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CASE_TYPE_ICONS, caseIntakeLimits, parseCaseType, type CaseType, type IntakeQuestion } from "../../shared/case-intake";
import { professionalLegalAreas } from "../../shared/legal-catalog";
import { CaseTypeIcon } from "./case-type-grid";
import { IntakePreview } from "./case-intake-form";
import styles from "./admin-case-types.module.css";

type AdminResponse = { types?: CaseType[]; type?: CaseType; canManage?: boolean; error?: string; issues?: { field: string; message: string }[] };
const clone = (type: CaseType): CaseType => ({ ...type, steps: type.steps.map((step) => ({ ...step, questions: step.questions.map((question) => ({ ...question, ...(question.options ? { options: [...question.options] } : {}) })) })) });
function newQuestion(): IntakeQuestion { return { id: `pregunta-${crypto.randomUUID().slice(0, 8)}`, label: "Nueva pregunta", type: "text", required: false, maxLength: 500 }; }
function newType(): CaseType { return { id: `nuevo-caso-${crypto.randomUUID().slice(0, 8)}`, category: "Otros Casos", topic: "Nuevo tipo de caso", description: "Describe qué situaciones comprende este tipo de solicitud legal.", icon: "Scale", enabled: false, sortOrder: 999, version: 1, steps: [{ id: "antecedentes", title: "Sobre tu situación", description: "Comparte solo lo necesario, sin datos sensibles ni información que identifique a terceros.", questions: [newQuestion()] }] }; }

export function AdminCaseTypes() {
  const [types, setTypes] = useState<CaseType[]>([]), [draft, setDraft] = useState<CaseType | null>(null), [original, setOriginal] = useState<CaseType | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [canManage, setCanManage] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [issues, setIssues] = useState<string[]>([]), [search, setSearch] = useState("");
  const [preview, setPreview] = useState(true);
  const pending = useRef(false);
  const dirty = draft !== null && (original === null || JSON.stringify(draft) !== JSON.stringify(original));

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/case-types", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json() as AdminResponse;
      if (!response.ok || !result.types) throw new Error(result.error || "No pudimos cargar los tipos de casos.");
      setTypes(result.types); setCanManage(result.canManage === true);
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Error de conexión."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function choose(type: CaseType | null) {
    if (dirty && !window.confirm("¿Descartar los cambios no guardados de este formulario?")) return;
    const value = type ? clone(type) : newType();
    setDraft(value); setOriginal(type ? clone(type) : null); setError(""); setIssues([]); setNotice("");
  }
  function patch(patch: Partial<CaseType>) { setDraft((current) => current ? { ...current, ...patch } : current); }
  function patchStep(index: number, patch: Partial<CaseType["steps"][number]>) { setDraft((current) => current ? { ...current, steps: current.steps.map((step, position) => position === index ? { ...step, ...patch } : step) } : current); }
  function patchQuestion(stepIndex: number, questionIndex: number, patch: Partial<IntakeQuestion>) {
    setDraft((current) => current ? { ...current, steps: current.steps.map((step, index) => index === stepIndex ? { ...step, questions: step.questions.map((question, position) => position === questionIndex ? { ...question, ...patch } : question) } : step) } : current);
  }
  function changeQuestionType(stepIndex: number, questionIndex: number, value: IntakeQuestion["type"]) {
    setDraft((current) => current ? { ...current, steps: current.steps.map((step, index) => index === stepIndex ? { ...step, questions: step.questions.map((question, position) => {
      if (position !== questionIndex) return question;
      const { options: _options, ...rest } = question; void _options;
      return { ...rest, type: value, maxLength: value === "textarea" ? 2000 : 500, ...(value === "select" ? { options: ["Opción 1", "Opción 2"] } : {}) };
    }) } : step) } : current);
  }
  function moveStep(index: number, direction: number) {
    if (!draft || index + direction < 0 || index + direction >= draft.steps.length) return;
    const steps = [...draft.steps]; [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]]; patch({ steps });
  }
  async function save() {
    if (!canManage || !draft || pending.current) return;
    const parsed = parseCaseType(draft);
    if (!parsed.ok) { setIssues(parsed.issues.map((issue) => `${issue.field}: ${issue.message}`)); return; }
    if (!original && types.some((type) => type.id === parsed.type.id)) { setIssues(["El identificador ya existe. Elige otro identificador estable."]); return; }
    pending.current = true; setBusy(true); setError(""); setIssues([]); setNotice("");
    try {
      const response = await fetch("/api/admin/case-types", { method: original ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: parsed.type, ...(original ? { expectedVersion: original.version } : {}) }) });
      const result = await response.json() as AdminResponse;
      if (!response.ok) {
        if (result.issues) setIssues(result.issues.map((issue) => `${issue.field}: ${issue.message}`));
        throw new Error(result.error || "No se guardó el formulario. Si otro administrador lo modificó, vuelve a seleccionarlo tras recargar.");
      }
      const refresh = await fetch("/api/admin/case-types", { cache: "no-store" });
      const updated = await refresh.json() as AdminResponse;
      if (!refresh.ok || !updated.types) throw new Error("El cambio se guardó, pero no pudimos actualizar el catálogo. Recarga antes de volver a editar.");
      setTypes(updated.types);
      const saved = updated.types.find((type) => type.id === parsed.type.id);
      if (saved) { setDraft(clone(saved)); setOriginal(clone(saved)); }
      setNotice("Formulario guardado y cambio registrado en la bitácora. El catálogo público usa esta versión; los borradores existentes conservan la versión con la que comenzaron.");
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); }
    finally { pending.current = false; setBusy(false); }
  }

  const filtered = types.filter((type) => `${type.topic} ${type.category}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  return <section className={`portal-panel ${styles.section}`} id="tipos-casos">
    <div className="panel-title"><div><p className="eyebrow">Catálogo y recorridos</p><h2>Tipos de casos y formularios</h2></div><button type="button" className="portal-primary-button" disabled={!canManage || busy} onClick={() => choose(null)}><Plus size={16} /> Agregar tipo de caso</button></div>
    <p className={styles.description}>Edita los títulos, iconos y preguntas que las personas ven antes de registrarse. La vista previa usa el mismo formulario del sitio y permite avanzar con errores sin guardar ni enviar solicitudes.</p>
    <p className={styles.description}>Hasta {caseIntakeLimits.types} tipos, {caseIntakeLimits.steps} etapas por tipo y {caseIntakeLimits.questions} preguntas totales. No se admiten HTML, código ni archivos en las preguntas. Revisa cada recorrido con un profesional antes de captar casos reales.</p>
    {loading ? <p role="status">Cargando catálogo…</p> : null}
    {!loading && !canManage ? <p className={styles.banner}>Tu acceso es de lectura. Solo administradores autorizados pueden guardar cambios.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}{notice ? <p role="status" className={styles.banner}>{notice}</p> : null}
    <div className={styles.layout}><aside className={styles.listPanel}><label className={styles.search}>Buscar tipo<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o categoría" /></label><div className={styles.list} aria-label="Tipos de casos configurados">{filtered.map((type) => <button type="button" key={type.id} className={draft?.id === type.id ? styles.selected : ""} onClick={() => choose(type)} disabled={busy}><CaseTypeIcon name={type.icon} size={20} /><span>{type.topic}<small>{type.category} · {type.enabled ? "Publicado" : "Oculto"} · v{type.version}</small></span></button>)}</div><p className={styles.count}>{types.filter((type) => type.enabled).length} publicados · {types.length} configurados</p></aside>
      <div className={styles.content}>{draft ? <>
        <div className={styles.editHeading}><h3>{original ? "Editar formulario" : "Nuevo formulario"}</h3><button type="button" className="text-link" onClick={() => setPreview(!preview)}><Eye size={16} /> {preview ? "Ocultar" : "Mostrar"} vista previa</button></div>
        <fieldset disabled={!canManage || busy} className={styles.editor}>
          <div className={styles.fields}><label>Nombre visible<input value={draft.topic} maxLength={120} onChange={(event) => patch({ topic: event.target.value })} /></label><label>Identificador estable<input value={draft.id} disabled={original !== null} maxLength={80} onChange={(event) => patch({ id: event.target.value })} /><small>No cambia después de crear el tipo; usa minúsculas y guiones.</small></label><label>Área legal<input list="case-type-categories" value={draft.category} maxLength={80} onChange={(event) => patch({ category: event.target.value })} /><datalist id="case-type-categories">{professionalLegalAreas.map((area) => <option key={area} value={area} />)}</datalist></label><label>Icono<select value={draft.icon} onChange={(event) => patch({ icon: event.target.value })}>{CASE_TYPE_ICONS.map((icon) => <option key={icon}>{icon}</option>)}</select></label><label>Orden en el home<input type="number" min={0} max={9999} value={draft.sortOrder} onChange={(event) => patch({ sortOrder: Number(event.target.value) })} /></label><label className={styles.checkbox}><input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /> Publicado en el catálogo</label><label className={styles.full}>Descripción de este tipo<textarea rows={3} maxLength={600} value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></label></div>
          {draft.steps.map((step, stepIndex) => <section className={styles.step} key={`editor-step-${stepIndex}`}>
            <div className={styles.stepHeader}><h4>Etapa {stepIndex + 1}</h4><div><button type="button" aria-label={`Subir etapa ${stepIndex + 1}`} disabled={stepIndex === 0} onClick={() => moveStep(stepIndex, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Bajar etapa ${stepIndex + 1}`} disabled={stepIndex === draft.steps.length - 1} onClick={() => moveStep(stepIndex, 1)}><ArrowDown size={15} /></button><button type="button" disabled={draft.steps.length === 1} onClick={() => { if (window.confirm("¿Quitar esta etapa y sus preguntas del formulario que estás editando?")) patch({ steps: draft.steps.filter((_, index) => index !== stepIndex) }); }}><Trash2 size={14} /> Quitar etapa</button></div></div>
            <div className={styles.fields}><label>Título de etapa<input value={step.title} maxLength={100} onChange={(event) => patchStep(stepIndex, { title: event.target.value })} /></label><label>Identificador de etapa<input value={step.id} maxLength={80} onChange={(event) => patchStep(stepIndex, { id: event.target.value })} /></label><label className={styles.full}>Ayuda o descripción<textarea rows={2} value={step.description} maxLength={500} onChange={(event) => patchStep(stepIndex, { description: event.target.value })} /></label></div>
            {step.questions.map((question, questionIndex) => <div className={styles.question} key={`editor-question-${questionIndex}`}>
              <div className={styles.questionHeading}><span>Pregunta {questionIndex + 1}</span><button type="button" disabled={step.questions.length === 1} onClick={() => patchStep(stepIndex, { questions: step.questions.filter((_, index) => index !== questionIndex) })}><Trash2 size={14} /> Quitar</button></div>
              <div className={styles.fields}><label className={styles.full}>Texto de la pregunta<input value={question.label} maxLength={240} onChange={(event) => patchQuestion(stepIndex, questionIndex, { label: event.target.value })} /></label><label>Identificador de pregunta<input value={question.id} maxLength={80} onChange={(event) => patchQuestion(stepIndex, questionIndex, { id: event.target.value })} /></label><label>Tipo de campo<select value={question.type} onChange={(event) => changeQuestionType(stepIndex, questionIndex, event.target.value as IntakeQuestion["type"])}><option value="text">Texto breve</option><option value="textarea">Párrafo</option><option value="select">Lista de opciones</option><option value="date">Fecha</option><option value="number">Número</option></select></label><label>Máximo de caracteres<input type="number" min={1} max={question.type === "textarea" ? 2000 : 500} value={question.maxLength || (question.type === "textarea" ? 2000 : 500)} onChange={(event) => patchQuestion(stepIndex, questionIndex, { maxLength: Number(event.target.value) })} /></label><label className={styles.checkbox}><input type="checkbox" checked={question.required} onChange={(event) => patchQuestion(stepIndex, questionIndex, { required: event.target.checked })} /> Respuesta obligatoria</label>{question.type === "select" ? <label className={styles.full}>Opciones (una por línea)<textarea rows={4} value={question.options?.join("\n") || ""} onChange={(event) => patchQuestion(stepIndex, questionIndex, { options: event.target.value.split("\n") })} /><small>De 2 a 20 opciones únicas; máximo 120 caracteres por opción.</small></label> : null}</div>
            </div>)}
            <button type="button" className="secondary-button" disabled={step.questions.length >= caseIntakeLimits.questionsPerStep || draft.steps.flatMap((item) => item.questions).length >= caseIntakeLimits.questions} onClick={() => patchStep(stepIndex, { questions: [...step.questions, newQuestion()] })}><Plus size={15} /> Agregar pregunta</button>
          </section>)}
          <div className={styles.actions}><button type="button" className="secondary-button" disabled={draft.steps.length >= caseIntakeLimits.steps} onClick={() => patch({ steps: [...draft.steps, { id: `etapa-${crypto.randomUUID().slice(0, 8)}`, title: "Nueva etapa", description: "", questions: [newQuestion()] }] })}><Plus size={15} /> Agregar etapa</button><button type="button" className="portal-primary-button" disabled={!dirty} onClick={() => void save()}><Save size={16} /> {busy ? "Guardando…" : "Guardar formulario"}</button></div>
        </fieldset>
        {issues.length ? <div className={styles.error} role="alert"><p>Corrige lo siguiente antes de guardar:</p><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div> : null}
        {dirty ? <p className={styles.count}>Cambios locales sin guardar. La vista previa de abajo ya refleja estos cambios; el sitio público se actualiza al guardar.</p> : null}
        {preview ? <div className={styles.preview}><IntakePreview type={draft} /></div> : null}
      </> : <p className={styles.empty}>Selecciona un tipo de caso para editar sus preguntas o recorrer la vista previa.</p>}</div>
    </div>
  </section>;
}
