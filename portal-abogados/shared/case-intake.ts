import { normalizeCaseSearchKeyword } from "./case-search-keywords";

/** Shared by the editor, public intake and Worker. Never contains executable HTML. */
export const CASE_TYPE_ICONS = ["Scale", "HeartHandshake", "Landmark", "BriefcaseBusiness", "House", "UsersRound", "ShieldCheck", "Gavel", "Globe", "Car", "Stethoscope", "FileText", "Banknote", "Leaf", "Dog", "GraduationCap", "Laptop", "Plane", "HandCoins", "Baby", "Building2", "Network", "Phone", "ShoppingBag", "KeyRound", "Fingerprint"] as const;
export type CaseTypeIcon = typeof CASE_TYPE_ICONS[number];
export type IntakeQuestion = { id: string; label: string; type: "text" | "textarea" | "select" | "date" | "number"; required: boolean; options?: string[]; maxLength?: number };
export type IntakeStep = { id: string; title: string; description: string; questions: IntakeQuestion[] };
export type IntakeSource = { title: string; url: string };
export type IntakeGuidance = { consultedAt: string; note: string; example: string; sources: IntakeSource[] };
export type CaseType = { id: string; category: string; topic: string; description: string; icon: string; enabled: boolean; sortOrder: number; version: number; steps: IntakeStep[]; guidance?: IntakeGuidance; searchKeywords?: string[] };
export type IntakeIssue = { field: string; message: string };
export type IntakeAnswersResult = { ok: true; answers: Record<string, string> } | { ok: false; issues: IntakeIssue[] };
export type CaseTypeResult = { ok: true; type: CaseType } | { ok: false; issues: IntakeIssue[] };
export const caseIntakeLimits = { types: 120, steps: 5, questionsPerStep: 8, questions: 20, schemaBytes: 24_000, answerBytes: 16_000, searchKeywords: 32, searchKeywordLength: 64, searchKeywordCharacters: 1600 } as const;
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const questionTypes = ["text", "textarea", "select", "date", "number"];
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeText(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max && !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value); }
function id(value: unknown) { return typeof value === "string" && value.length <= 80 && identifier.test(value); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }
const officialSourceDomains = ["gob.cl", "gov.cl", "bcn.cl", "pjud.cl", "dt.gob.cl", "sii.cl", "cmfchile.cl", "sernac.cl", "suseso.cl", "superir.gob.cl", "superdesalud.gob.cl", "serviciomigraciones.cl", "inapi.cl", "aduana.cl", "indh.cl", "fiscaliadechile.cl", "tta.cl"];
export function isOfficialIntakeSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 700 || /[\s<>\u0000-\u001f]/u.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && officialSourceDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)); } catch { return false; }
}

export function parseCaseType(input: unknown): CaseTypeResult {
  const issues: IntakeIssue[] = [];
  const error = (field: string, message: string) => issues.push({ field, message });
  if (!record(input)) return { ok: false, issues: [{ field: "type", message: "El tipo de caso debe ser un objeto." }] };
  if (new TextEncoder().encode(JSON.stringify(input)).length > caseIntakeLimits.schemaBytes) return { ok: false, issues: [{ field: "type", message: "El formulario supera el tamaño permitido." }] };
  if (!id(input.id)) error("id", "Usa un identificador estable en minúsculas, números y guiones (máximo 80 caracteres).");
  for (const [field, min, max] of [["category", 3, 80], ["topic", 3, 120], ["description", 10, 600]] as const) if (!safeText(input[field], min, max)) error(field, `Escribe texto sin HTML de ${min} a ${max} caracteres.`);
  if (typeof input.icon !== "string" || !CASE_TYPE_ICONS.some((icon) => icon === input.icon)) error("icon", "Selecciona un icono permitido.");
  if (typeof input.enabled !== "boolean") error("enabled", "Indica si el tipo está publicado.");
  if (!integer(input.sortOrder, 0, 9999)) error("sortOrder", "El orden debe ser un entero entre 0 y 9999.");
  if (!integer(input.version, 1, 2_000_000_000)) error("version", "La versión no es válida.");
  let searchKeywords: string[] | undefined;
  if (input.searchKeywords !== undefined) {
    if (!Array.isArray(input.searchKeywords) || input.searchKeywords.length > caseIntakeLimits.searchKeywords) error("searchKeywords", "Incluye un máximo de 32 palabras o frases de búsqueda.");
    else {
      searchKeywords = [];
      const seen = new Set<string>();
      let total = 0;
      input.searchKeywords.forEach((keyword: unknown, index: number) => {
        if (typeof keyword !== "string" || /[<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\uFEFF]/u.test(keyword)) { error(`searchKeywords.${index}`, "Usa palabras o frases sin HTML ni caracteres de control."); return; }
        const value = keyword.trim().replace(/\s+/gu, " ");
        if (!value || value.length > caseIntakeLimits.searchKeywordLength) { error(`searchKeywords.${index}`, "Cada término debe tener entre 1 y 64 caracteres."); return; }
        total += value.length;
        const key = normalizeCaseSearchKeyword(value);
        if (!seen.has(key)) { seen.add(key); searchKeywords!.push(value); }
      });
      if (total > caseIntakeLimits.searchKeywordCharacters) error("searchKeywords", "Las palabras de búsqueda no pueden superar 1600 caracteres en total.");
    }
  }
  const steps: IntakeStep[] = [], stepIds = new Set<string>(), questionIds = new Set<string>();
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > caseIntakeLimits.steps) error("steps", "Incluye entre 1 y 5 pasos.");
  else input.steps.forEach((step: unknown, index: number) => {
    const path = `steps.${index}`;
    if (!record(step)) { error(path, "Paso inválido."); return; }
    if (!id(step.id) || stepIds.has(String(step.id))) error(`${path}.id`, "Cada paso necesita un identificador único."); else stepIds.add(String(step.id));
    if (!safeText(step.title, 3, 100)) error(`${path}.title`, "Escribe un título sin HTML de 3 a 100 caracteres.");
    if (!safeText(step.description, 0, 500)) error(`${path}.description`, "La descripción no puede contener HTML ni superar 500 caracteres.");
    const questions: IntakeQuestion[] = [];
    if (!Array.isArray(step.questions) || step.questions.length < 1 || step.questions.length > caseIntakeLimits.questionsPerStep) error(`${path}.questions`, "Incluye entre 1 y 8 preguntas por paso.");
    else step.questions.forEach((question: unknown, qIndex: number) => {
      const qPath = `${path}.questions.${qIndex}`;
      if (!record(question)) { error(qPath, "Pregunta inválida."); return; }
      if (!id(question.id) || questionIds.has(String(question.id))) error(`${qPath}.id`, "Cada pregunta necesita un identificador único en todo el formulario."); else questionIds.add(String(question.id));
      if (!safeText(question.label, 3, 240)) error(`${qPath}.label`, "Escribe una pregunta sin HTML de 3 a 240 caracteres.");
      if (typeof question.type !== "string" || !questionTypes.includes(question.type)) error(`${qPath}.type`, "Tipo de campo inválido.");
      if (typeof question.required !== "boolean") error(`${qPath}.required`, "Indica si la pregunta es obligatoria.");
      if (question.maxLength !== undefined && !integer(question.maxLength, 1, question.type === "textarea" ? 2000 : 500)) error(`${qPath}.maxLength`, "Límite inválido: hasta 2000 caracteres en párrafos y 500 en los otros campos.");
      let options: string[] | undefined;
      if (question.type === "select") {
        if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 20 || question.options.some((option) => !safeText(option, 1, 120)) || new Set(question.options).size !== question.options.length) error(`${qPath}.options`, "Incluye entre 2 y 20 opciones distintas sin HTML.");
        else options = question.options.map((option: string) => option.trim());
        if (options && new Set(options).size !== options.length) error(`${qPath}.options`, "Las opciones no pueden repetirse tras quitar espacios.");
      } else if (question.options !== undefined) error(`${qPath}.options`, "Solo los selectores tienen opciones.");
      questions.push({ id: String(question.id), label: String(question.label).trim(), type: question.type as IntakeQuestion["type"], required: question.required === true, ...(options ? { options } : {}), ...(question.maxLength !== undefined ? { maxLength: Number(question.maxLength) } : {}) });
    });
    steps.push({ id: String(step.id), title: String(step.title).trim(), description: String(step.description).trim(), questions });
  });
  if (questionIds.size > caseIntakeLimits.questions) error("steps", "El formulario admite un máximo de 20 preguntas.");
  let guidance: IntakeGuidance | undefined;
  if (input.guidance !== undefined) {
    const value = input.guidance;
    if (!record(value)) error("guidance", "Las referencias editoriales deben ser un objeto.");
    else {
      const date = value.consultedAt;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < "2020-01-01" || date > "2100-12-31") error("guidance.consultedAt", "Indica una fecha de consulta válida.");
      if (!safeText(value.note, 10, 600)) error("guidance.note", "Escribe una nota editorial sin HTML de 10 a 600 caracteres.");
      if (!safeText(value.example, 10, 600)) error("guidance.example", "Escribe un ejemplo ficticio sin HTML de 10 a 600 caracteres.");
      const sources: IntakeSource[] = [];
      if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 6) error("guidance.sources", "Incluye entre 1 y 6 fuentes oficiales.");
      else value.sources.forEach((source: unknown, index: number) => {
        if (!record(source) || !safeText(source.title, 3, 160) || !isOfficialIntakeSource(source.url)) error(`guidance.sources.${index}`, "Usa un título de 3 a 160 caracteres y un enlace HTTPS de una fuente oficial chilena.");
        else sources.push({ title: source.title.trim(), url: source.url });
      });
      if (new Set(sources.map((source) => source.url)).size !== sources.length) error("guidance.sources", "No repitas una misma fuente.");
      guidance = { consultedAt: String(date), note: String(value.note).trim(), example: String(value.example).trim(), sources };
    }
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, type: { id: String(input.id), category: String(input.category).trim(), topic: String(input.topic).trim(), description: String(input.description).trim(), icon: String(input.icon), enabled: input.enabled === true, sortOrder: Number(input.sortOrder), version: Number(input.version), steps, ...(guidance ? { guidance } : {}), ...(searchKeywords !== undefined ? { searchKeywords } : {}) } };
}

export function validateIntakeAnswers(caseType: CaseType, input: unknown, partial = false): IntakeAnswersResult {
  if (!record(input)) return { ok: false, issues: [{ field: "answers", message: "Las respuestas deben ser un objeto." }] };
  if (new TextEncoder().encode(JSON.stringify(input)).length > caseIntakeLimits.answerBytes) return { ok: false, issues: [{ field: "answers", message: "Las respuestas superan el tamaño permitido." }] };
  const issues: IntakeIssue[] = [], answers: Record<string, string> = {}, questions = caseType.steps.flatMap((step) => step.questions), validIds = new Set(questions.map((question) => question.id));
  for (const key of Object.keys(input)) if (!validIds.has(key)) issues.push({ field: key, message: "Esta pregunta no pertenece al formulario actual." });
  for (const question of questions) {
    const raw = input[question.id];
    if (raw === undefined || raw === "") { if (question.required && !partial) issues.push({ field: question.id, message: "Completa este campo." }); continue; }
    if (typeof raw !== "string") { issues.push({ field: question.id, message: "La respuesta debe ser texto." }); continue; }
    const value = raw.trim(), limit = question.maxLength ?? (question.type === "textarea" ? 2000 : 500);
    if (!value) { if (question.required && !partial) issues.push({ field: question.id, message: "Completa este campo." }); continue; }
    if (!safeText(value, 1, limit)) { issues.push({ field: question.id, message: `Usa texto sin HTML de hasta ${limit} caracteres.` }); continue; }
    if (question.type === "select" && !question.options?.includes(value)) { issues.push({ field: question.id, message: "Selecciona una de las opciones disponibles." }); continue; }
    if (question.type === "number" && (!/^-?\d+(?:\.\d{1,4})?$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e12)) { issues.push({ field: question.id, message: "Ingresa un número válido, sin separadores de miles." }); continue; }
    if (question.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2100-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) { issues.push({ field: question.id, message: "Ingresa una fecha válida entre 1900 y 2100." }); continue; }
    answers[question.id] = value;
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers };
}
