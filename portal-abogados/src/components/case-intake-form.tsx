"use client";

import type { CaseType } from "../../shared/case-intake";
import { useState } from "react";
import { chileRegions } from "../../shared/chile";
import styles from "./case-intake-form.module.css";

export type IntakeAnswers = Record<string, string>;
export type IntakeQuestion = CaseType["steps"][number]["questions"][number];
export type IntakeContact = { fullName: string; phone: string; region: string; commune: string; attentionMode: string };
export const emptyIntakeContact: IntakeContact = { fullName: "", phone: "", region: "", commune: "", attentionMode: "cualquiera" };

export function intakeContactIssues(contact: IntakeContact) {
  const issues: string[] = [];
  if (contact.fullName.trim().length < 3) issues.push("Escribe tu nombre completo (al menos 3 caracteres).");
  if (!/^\+?[0-9 ()-]{8,24}$/.test(contact.phone.trim()) || contact.phone.replace(/\D/g, "").length < 8) issues.push("Escribe un teléfono válido con al menos 8 dígitos, incluyendo el código de país.");
  if (!(chileRegions as readonly string[]).includes(contact.region)) issues.push("Selecciona una región.");
  if (contact.commune.trim().length < 2) issues.push("Escribe tu comuna.");
  if (!["remote", "presencial", "cualquiera"].includes(contact.attentionMode)) issues.push("Selecciona una modalidad de atención.");
  return issues;
}

export function IntakeContactFields({ contact, onChange, disabled = false, prefix = "intake-contact" }: { contact: IntakeContact; onChange: (contact: IntakeContact) => void; disabled?: boolean; prefix?: string }) {
  return <div className={styles.contactGrid}>
    <div className={styles.field}><label htmlFor={`${prefix}-name`}>Nombre completo *</label><input id={`${prefix}-name`} autoComplete="name" value={contact.fullName} maxLength={120} disabled={disabled} aria-required="true" onChange={(event) => onChange({ ...contact, fullName: event.target.value })} /></div>
    <div className={styles.field}><label htmlFor={`${prefix}-phone`}>Teléfono con código de país *</label><input id={`${prefix}-phone`} type="tel" inputMode="tel" autoComplete="tel" placeholder="+56 9 1234 5678" value={contact.phone} maxLength={24} disabled={disabled} aria-required="true" onChange={(event) => onChange({ ...contact, phone: event.target.value })} /></div>
    <div className={styles.field}><label htmlFor={`${prefix}-region`}>Región *</label><select id={`${prefix}-region`} value={contact.region} disabled={disabled} aria-required="true" onChange={(event) => onChange({ ...contact, region: event.target.value, commune: "" })}><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></div>
    <div className={styles.field}><label htmlFor={`${prefix}-commune`}>Comuna *</label><input id={`${prefix}-commune`} autoComplete="address-level2" value={contact.commune} maxLength={80} disabled={disabled} aria-required="true" onChange={(event) => onChange({ ...contact, commune: event.target.value })} /></div>
    <div className={styles.field}><label htmlFor={`${prefix}-attention`}>Modalidad de atención *</label><select id={`${prefix}-attention`} value={contact.attentionMode} disabled={disabled} aria-required="true" onChange={(event) => onChange({ ...contact, attentionMode: event.target.value })}><option value="cualquiera">Presencial u online</option><option value="presencial">Solo presencial</option><option value="remote">Solo online</option></select></div>
  </div>;
}

export function intakeStepIssues(questions: IntakeQuestion[], answers: IntakeAnswers) {
  return questions.flatMap((question) => {
    const value = (answers[question.id] || "").trim();
    if (!value) return question.required ? [`Completa: ${question.label}`] : [];
    if (value.length > (question.maxLength || (question.type === "textarea" ? 2000 : 500))) return [`Acorta la respuesta de: ${question.label}`];
    if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) return [`Usa texto sin HTML en: ${question.label}`];
    if (question.type === "select" && !question.options?.includes(value)) return [`Selecciona una opción válida en: ${question.label}`];
    if (question.type === "number" && (!/^-?\d+(?:\.\d{1,4})?$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e12)) return [`Escribe un número válido, sin separadores de miles, en: ${question.label}`];
    if (question.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2100-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return [`Revisa la fecha en: ${question.label}`];
    return [];
  });
}

export function IntakeFields({ step, answers, onChange, disabled = false, prefix = "intake" }: {
  step: CaseType["steps"][number]; answers: IntakeAnswers; onChange: (id: string, value: string) => void; disabled?: boolean; prefix?: string;
}) {
  return <div className={styles.fields}>
    {step.description ? <p className={styles.description}>{step.description}</p> : null}
    {step.questions.map((question) => {
      const id = `${prefix}-${question.id}`;
      const value = answers[question.id] || "";
      return <div className={styles.field} key={question.id}>
        <label htmlFor={id}>{question.label}{question.required ? <span aria-label="obligatorio"> *</span> : <small> (opcional)</small>}</label>
        {question.type === "textarea" ? <textarea id={id} value={value} maxLength={question.maxLength || 2000} rows={4} disabled={disabled} aria-required={question.required} onChange={(event) => onChange(question.id, event.target.value)} aria-describedby={`${id}-help`} />
          : question.type === "select" ? <select id={id} value={value} disabled={disabled} aria-required={question.required} onChange={(event) => onChange(question.id, event.target.value)}><option value="">Selecciona una opción</option>{question.options?.map((option, index) => <option key={`${index}-${option}`} value={option}>{option}</option>)}</select>
            : <input id={id} type={question.type} value={value} maxLength={question.maxLength || 500} disabled={disabled} aria-required={question.required} onChange={(event) => onChange(question.id, event.target.value)} autoComplete="off" min={question.type === "date" ? "1900-01-01" : undefined} max={question.type === "date" ? "2100-12-31" : undefined} />}
        {question.type === "textarea" ? <small className={styles.counter} id={`${id}-help`}>{value.length}/{question.maxLength || 2000} caracteres. Evita nombres de terceros, RUT, claves y datos bancarios.</small> : null}
      </div>;
    })}
  </div>;
}

export function IntakePreview({ type }: { type: CaseType }) {
  return <PreviewSteps key={type.id} type={type} />;
}

function PreviewSteps({ type }: { type: CaseType }) {
  const [step, setStep] = useState(0), [answers, setAnswers] = useState<IntakeAnswers>({}), [issues, setIssues] = useState<string[]>([]), [contact, setContact] = useState<IntakeContact>(emptyIntakeContact);
  const activeStep = type.steps[Math.min(step, type.steps.length - 1)];
  if (!activeStep) return <p className={styles.message}>Agrega al menos una etapa para previsualizar el formulario.</p>;
  return <div className={styles.preview}>
    <p className={styles.previewBanner}>Vista previa en vivo · No guarda ni envía datos. Puedes avanzar con errores.</p>
    <nav className={styles.stepNav} aria-label="Etapas de demostración">{type.steps.map((item, index) => <button type="button" key={item.id} aria-current={index === step ? "step" : undefined} onClick={() => { setStep(index); setIssues([]); }}>{index + 1}. {item.title}</button>)}<button type="button" aria-current={step === type.steps.length ? "step" : undefined} onClick={() => { setStep(type.steps.length); setIssues([]); }}>Contacto</button><button type="button" aria-current={step > type.steps.length ? "step" : undefined} onClick={() => { setStep(type.steps.length + 1); setIssues([]); }}>Cuenta y envío</button></nav>
    <h3>{type.topic}</h3>
    {step < type.steps.length ? <><h4>{activeStep.title}</h4><IntakeFields step={activeStep} answers={answers} prefix="preview" onChange={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))} /><div className={styles.actions}><button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep(step - 1)}>Atrás</button><button type="button" className="primary-button" onClick={() => { setIssues(intakeStepIssues(activeStep.questions, answers)); setStep(step + 1); }}>Continuar demostración</button></div></>
      : step === type.steps.length ? <><h4>¿Cómo podemos contactarte?</h4><p>Tu contacto solo se comparte con el abogado cuya propuesta aceptes.</p><IntakeContactFields prefix="preview-contact" contact={contact} onChange={setContact} /><div className={styles.actions}><button type="button" className="secondary-button" onClick={() => setStep(step - 1)}>Atrás</button><button type="button" className="primary-button" onClick={() => { setIssues(intakeContactIssues(contact)); setStep(step + 1); }}>Continuar a mi cuenta</button></div></>
        : <><h4>Crea tu cuenta y verifica tu correo</h4><p>Ahora el cliente elige el correo de su cuenta. En el recorrido real el borrador se conserva al abrir el registro y se recupera al volver.</p><div className={styles.actions}><button type="button" className="primary-button" onClick={() => setIssues(["Demostración: aquí se abriría el registro con Google y se verificaría el correo. No se inicia ninguna sesión desde esta vista previa."])}>Crear cuenta de cliente con Google</button><button type="button" className="secondary-button" onClick={() => setIssues(["Demostración: aquí se abriría el registro con correo. Para publicar después debe verificarse la dirección; actualmente mediante una cuenta Google con la misma dirección."])}>Registrarme con correo</button></div><p>La publicación real exige una cuenta de cliente y correo verificado, además de la confirmación expresa de los antecedentes y términos. Esta demostración no crea cuentas, no envía correos ni publica casos.</p><button type="button" className="secondary-button" onClick={() => { setStep(0); setIssues([]); }}>Volver al inicio</button></>}
    {issues.length ? <div role="status" className={styles.message}><p>En una solicitud real faltaría corregir:</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><p>En la demostración puedes seguir.</p></div> : null}
  </div>;
}
