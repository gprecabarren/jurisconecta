"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CreditCard, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { BillingMode, BillingPlan } from "../../shared/billing";
import type { CaseCatalogSummary } from "../../shared/case-catalog-summary";
import { activePracticeSelection, lawyerProfessionalIssues, lawyerSteps, type LawyerDraft } from "../../shared/lawyer-onboarding";
import { LawyerProfessionalFields } from "./lawyer-professional-fields";
import styles from "./lawyer-onboarding.module.css";

type Props = {
  initial: LawyerDraft;
  catalog: readonly CaseCatalogSummary[];
  plans: readonly BillingPlan[];
  mode: BillingMode;
  emailVerified?: boolean;
  googleAvailable?: boolean;
  googleError?: boolean;
  preview?: boolean;
  onSubmit?: (draft: LawyerDraft) => Promise<void>;
  onReset?: () => void;
};

const faq = [
  ["Cambio de plan", "Una vez aprobado tu perfil podrás consultar las opciones disponibles desde el panel de planes."],
  ["Cupones de descuento", "La plataforma aún no aplica cupones. Si tienes un código de referido, puedes anotarlo en tu perfil."],
  ["Renovación automática", "Los ciclos de créditos gratuitos se rigen por la configuración de JurisConecta. Actualmente no hay cargos automáticos."],
  ["Adelantar la renovación", "Después de la aprobación podrás consultar en tu panel si tu plan permite renovar antes del término del período."],
  ["Cancelación del plan", "Puedes revisar las opciones y el efecto sobre los créditos desde tu panel de planes."],
  ["Métodos de pago", "El pago con tarjeta está previsto para una etapa posterior."],
  ["Seguridad de las transacciones", "El sitio no solicita datos de tarjetas ni procesa pagos durante la postulación."],
] as const;
const formatUf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const formatClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });

export function LawyerOnboarding({ initial, catalog, plans, mode, emailVerified, googleAvailable, googleError, preview = false, onSubmit, onReset }: Props) {
  const enabledPlans = plans.filter((plan) => plan.active);
  const [draft, setDraft] = useState<LawyerDraft>(() => ({
    ...initial,
    ...activePracticeSelection(initial.specialties, initial.practiceTopicIds, catalog),
    planCode: enabledPlans.some((plan) => plan.code === initial.planCode) ? initial.planCode : "",
  }));
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewDone, setPreviewDone] = useState(false);
  const locked = useRef(false);
  const focusStep = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const planName = useId();
  const stepTitleId = useId();

  useEffect(() => {
    if (focusStep.current) {
      heading.current?.focus();
      focusStep.current = false;
    }
  }, [step]);

  function change(patch: Partial<LawyerDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    if (previewDone) setPreviewDone(false);
  }

  function move(next: number) {
    if (next !== step) focusStep.current = true;
    setStep(next);
    setNotice("");
    setPreviewDone(false);
  }

  function showIssues(issues: string[]) {
    setNotice(issues.length ? `Revisa estos campos: ${issues.join(", ")}.${preview ? " Puedes continuar en esta vista previa." : ""}` : "");
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = event.currentTarget;
    let issues: string[] = [];
    if (step === 1 && !draft.manualVerificationConsent) issues = ["Autorización para coordinar la verificación"];
    if (step === 2) issues = lawyerProfessionalIssues(draft);
    if (step === 3) {
      issues = [
        ...lawyerProfessionalIssues(draft),
        ...(!draft.manualVerificationConsent ? ["Autorización para coordinar la verificación"] : []),
        ...(!enabledPlans.some((plan) => plan.code === draft.planCode) ? ["Plan profesional"] : []),
      ];
    }
    const validFields = form.checkValidity();
    if (!validFields && !issues.length) issues = ["Los campos marcados por el formulario"];
    if (issues.length && !preview) {
      form.reportValidity();
      showIssues(issues);
      return;
    }
    if (step < lawyerSteps.length - 1) {
      move(step + 1);
      showIssues(issues);
      return;
    }
    if (preview) {
      showIssues(issues);
      setPreviewDone(true);
      return;
    }
    if (!onSubmit) return;
    locked.current = true;
    setSaving(true);
    setNotice("");
    try { await onSubmit(draft); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos enviar la postulación. Inténtalo de nuevo."); }
    finally { locked.current = false; setSaving(false); }
  }

  return <form className={styles.workflow} onSubmit={advance} onInvalidCapture={(event) => {
    const details = event.target instanceof HTMLElement ? event.target.closest("details") : null;
    if (!preview && details) details.open = true;
  }} noValidate aria-labelledby={stepTitleId}>
    <ol className={styles.progress} aria-label="Etapas de la postulación">
      {lawyerSteps.map((label, index) => <li key={label}>{preview
        ? <button type="button" aria-current={step === index ? "step" : undefined} onClick={() => move(index)}><b aria-hidden="true">{index + 1}</b>{label}</button>
        : <span className={styles.step} aria-current={step === index ? "step" : undefined}><b aria-hidden="true">{index + 1}</b>{label}</span>}
      </li>)}
    </ol>
    <div className={styles.stage}>
      <h2 tabIndex={-1} ref={heading} id={stepTitleId}>{lawyerSteps[step]}</h2>
      {notice && <div className={styles.error} role="alert">{notice}</div>}
      {step === 0 && (emailVerified
        ? <div className={styles.note}><h3><MailCheck aria-hidden="true" size={20} /> Correo verificado</h3><p>Tu correo {draft.email} está verificado con Google.</p></div>
        : <>
          <p className={styles.lede}>Correo de la cuenta{draft.email ? ` · ${draft.email}` : ""}</p>
          <div className={styles.note}>
            <label className={styles.code}>Código de verificación<input disabled inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 dígitos" /></label>
            <div className={styles.actions}>
              <button type="button" className="portal-outline-button" disabled>Verificar código</button>
              <button type="button" className="back-button" disabled>Reenviar código</button>
            </div>
            <p>{googleAvailable || preview ? "El envío de códigos está pendiente. Verifica el mismo correo con Google o continúa para coordinar la revisión con el equipo." : "El envío de códigos está pendiente. Continúa para coordinar la revisión del correo con el equipo."}</p>
          </div>
          {googleError && <div className={styles.error} role="alert">No pudimos verificar el correo con Google. Usa la misma dirección de tu cuenta o continúa para que el equipo la revise.</div>}
          <div className={styles.actions}>{preview
            ? <button type="button" className="portal-outline-button" disabled>Verificar correo con Google</button>
            : googleAvailable && <a className="portal-outline-button" href="/auth/google/start?intent=link&role=lawyer">Verificar correo con Google</a>}
          </div>
        </>)}
      {step === 1 && <div className={styles.note}>
        <h3><ShieldCheck aria-hidden="true" size={20} /> Revisión de documentos originales</h3>
        <p>Un administrador revisará tu cédula y tu acreditación profesional por videollamada o presencialmente. El equipo se comunicará contigo después de recibir la postulación.</p>
        <p>Ten los originales a mano para esa revisión. El formulario solo solicita tu RUT y los datos de tu perfil.</p>
        <label className={styles.check}><input type="checkbox" name="manualVerificationConsent" checked={draft.manualVerificationConsent} onChange={(event) => change({ manualVerificationConsent: event.target.checked })} required />Acepto que JurisConecta me contacte para coordinar la verificación de mis documentos originales.</label>
      </div>}
      {step === 2 && <>
        <p className={styles.lede}>Completa tu perfil y elige las materias que quieres atender. Podrás actualizar tus preferencias desde tu cuenta.</p>
        <LawyerProfessionalFields value={draft} onChange={change} catalog={catalog} preview={preview} />
      </>}
      {step === 3 && <>
        <p className={styles.lede}>{mode === "free"
          ? "Elige un plan para el período de prueba. Los créditos se habilitan cuando el equipo aprueba tu perfil. El período de prueba es gratuito."
          : "Puedes indicar el plan de tu interés. Tu elección se guarda con la postulación y no genera cobros."}</p>
        {enabledPlans.length ? <div className={styles.plans} role="group" aria-label="Planes profesionales">
          {enabledPlans.map((plan) => <label className={styles.plan} key={plan.code}>
            {plan.featured && <span className={styles.badge}>Destacado</span>}
            <strong>{plan.name}</strong>
            <span>{plan.monthly_credits} créditos por período</span>
            <span className={styles.badge}>{mode === "free" ? "Gratis en el piloto" : `${formatUf.format(plan.monthly_price_uf)} UF · ${formatClp.format(plan.monthly_price_clp)} CLP de referencia`}</span>
            {plan.description && <p>{plan.description}</p>}
            {!!plan.benefits.length && <ul>{plan.benefits.map((benefit, index) => <li key={index}>{benefit}</li>)}</ul>}
            <span className={styles.check}><input type="radio" name={planName} value={plan.code} checked={draft.planCode === plan.code} onChange={() => change({ planCode: plan.code })} required />Elegir {plan.name}</span>
          </label>)}
        </div> : <div className={styles.error} role="status">Por ahora no hay planes disponibles. Puedes volver más tarde o contactar a soporte.</div>}
        <div className={styles.payment}>
          <h3><CreditCard aria-hidden="true" size={20} /> Medios de pago</h3>
          <p>Los pagos con tarjeta estarán disponibles en una etapa posterior.</p>
          <div className={styles.actions}><button type="button" className="portal-outline-button" disabled>Agregar tarjeta</button><button type="button" className="portal-outline-button" disabled>Pagar con tarjeta</button></div>
        </div>
        <div className={styles.faq}><h3>Preguntas frecuentes sobre los planes</h3>{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        {!preview && <Link href="/planes">Ver las condiciones de los planes</Link>}
      </>}
      {previewDone && <div role="status" className="preview-banner">Fin del recorrido de demostración. La postulación no se guardó.</div>}
    </div>
    <div className={styles.navigation}>
      <div className={styles.side}>
        {step > 0 && <button className="portal-outline-button" type="button" onClick={() => move(step - 1)} disabled={saving}><ArrowLeft size={17} aria-hidden="true" /> Atrás</button>}
        {preview && onReset && <button className="back-button" type="button" onClick={onReset}>Reiniciar prueba</button>}
      </div>
      <button className="portal-primary-button" type="submit" disabled={saving || (!preview && step === 3 && !enabledPlans.length)}>
        {step === 3 ? (saving ? "Enviando…" : preview ? "Simular envío" : "Enviar postulación") : step === 0 && !emailVerified ? "Continuar a la revisión" : "Siguiente"}
        {step < 3 && <ArrowRight size={17} aria-hidden="true" />}
      </button>
    </div>
  </form>;
}
