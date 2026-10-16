"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CaseType } from "../../shared/case-intake";
import { validateIntakeAnswers } from "../../shared/case-intake";
import { CaseTypeGrid, CaseTypeIcon } from "./case-type-grid";
import { emptyIntakeContact, IntakeContactFields, intakeContactIssues, IntakeFields, intakeStepIssues, type IntakeAnswers, type IntakeContact } from "./case-intake-form";
import styles from "./case-intake-wizard.module.css";

type Contact = IntakeContact;
type Draft = { id: string; typeId: string; typeVersion: number; schema: CaseType; answers: IntakeAnswers; contact: Contact; step: number; version: number; expiresAt: number };
type IntakeUser = { id: string; role: string; email: string; emailVerified: boolean };
type DraftResponse = { draft: Draft | null; user: IntakeUser | null; error?: string; issues?: { field: string; message: string }[] };
const emptyContact = emptyIntakeContact;

function signature(type: CaseType | null, answers: IntakeAnswers, contact: Contact, step: number) {
  return JSON.stringify({ typeId: type?.id, answers, contact, step });
}

export function CaseIntakeWizard() {
  const [types, setTypes] = useState<CaseType[]>([]), [selected, setSelected] = useState<CaseType | null>(null);
  const [answers, setAnswers] = useState<IntakeAnswers>({}), [contact, setContact] = useState<Contact>(emptyContact), [step, setStep] = useState(0);
  const [version, setVersion] = useState<number | undefined>(), [user, setUser] = useState<IntakeUser | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]), [notice, setNotice] = useState("");
  const [savedSignature, setSavedSignature] = useState(""), [savedAt, setSavedAt] = useState("");
  const [requestedType, setRequestedType] = useState<CaseType | null>(null), [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false), suppressUnload = useRef(false);
  const dirty = selected !== null && signature(selected, answers, contact, step) !== savedSignature;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/case-types", { cache: "no-store", signal: controller.signal }).then(async (response) => { const result = await response.json() as { types: CaseType[]; error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos cargar los tipos de casos."); return result.types; }),
      fetch("/api/intake/draft", { cache: "no-store", signal: controller.signal }).then(async (response) => { const result = await response.json() as DraftResponse; if (!response.ok) throw new Error(result.error || "No pudimos recuperar tu borrador."); return result; }),
    ]).then(([catalog, result]) => {
      const active = catalog.filter((type) => type.enabled);
      setTypes(active); setUser(result.user);
      const requested = active.find((type) => type.id === new URLSearchParams(window.location.search).get("tipo")) || null;
      if (result.draft) {
        const draft = result.draft;
        const schema = draft.schema || active.find((type) => type.id === draft.typeId);
        if (!schema) throw new Error("El tipo de caso del borrador ya no está disponible. Puedes volver al catálogo.");
        const restoredContact = { ...emptyContact, ...draft.contact };
        const restoredStep = Math.max(0, Math.min(draft.step, schema.steps.length + 1));
        setSelected(schema); setAnswers(draft.answers); setContact(restoredContact); setStep(restoredStep); setVersion(draft.version);
        setSavedSignature(signature(schema, draft.answers, restoredContact, restoredStep));
        setNotice("Recuperamos tu borrador guardado. Revisa los datos antes de continuar.");
        if (requested && requested.id !== schema.id) setRequestedType(requested);
      } else if (requested) setSelected(requested);
      else if (new URLSearchParams(window.location.search).has("tipo")) setNotice("Ese tipo de caso no está disponible. Elige otro del catálogo.");
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Error de conexión."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!suppressUnload.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function scrollToForm() { document.getElementById("intake-heading")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  async function persist(nextStep = step) {
    if (!selected || pending.current) return false;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/intake/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typeId: selected.id, answers, contact, step: nextStep, ...(version !== undefined ? { expectedVersion: version } : {}) }) });
      const result = await response.json() as DraftResponse;
      if (!response.ok || !result.draft) throw new Error(result.error || "No pudimos guardar. Mantén esta pestaña abierta y vuelve a intentarlo.");
      setVersion(result.draft.version); setStep(nextStep); setSavedSignature(signature(selected, answers, contact, nextStep));
      setSavedAt(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
      setNotice("Borrador guardado. Aún no se ha publicado ni compartido con abogados.");
      return result.draft.version;
    } catch (err) { setError(err instanceof Error ? err.message : "No pudimos guardar los cambios."); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function next() {
    if (!selected) return;
    const problems = step < selected.steps.length ? intakeStepIssues(selected.steps[step].questions, answers) : intakeContactIssues(contact);
    setIssues(problems);
    if (problems.length) { scrollToForm(); return; }
    if (await persist(step + 1) !== false) { setIssues([]); scrollToForm(); }
  }
  async function authenticate(href: string) { if (await persist(step) !== false) { suppressUnload.current = true; window.location.assign(href); } }
  async function startOver(nextType?: CaseType) {
    if (pending.current || !window.confirm("¿Descartar el borrador pendiente y comenzar otra solicitud? Esto no elimina casos ya publicados.")) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/intake/draft", { method: "DELETE" });
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || "No pudimos descartar el borrador."); }
      setSelected(nextType || null); setAnswers({}); setContact(emptyContact); setStep(0); setVersion(undefined); setSavedSignature(""); setSavedAt(""); setRequestedType(null); setNotice(""); setIssues([]); setConfirmed(false);
      window.history.replaceState(null, "", nextType ? `/solicitar/?tipo=${encodeURIComponent(nextType.id)}` : "/solicitar/");
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function publish() {
    if (!selected || !user || user.role !== "person" || !user.emailVerified || !confirmed || pending.current) return;
    const validation = validateIntakeAnswers(selected, answers);
    const problems = [...(!validation.ok ? validation.issues.map((issue) => issue.message) : []), ...intakeContactIssues(contact)];
    if (problems.length) { setIssues(problems); return; }
    const savedVersion = dirty ? await persist(step) : version;
    if (savedVersion === false || savedVersion === undefined) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/intake/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: savedVersion, confirm: true }) });
      const result = await response.json() as { error?: string; id?: string; redirect?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "No pudimos publicar. El borrador sigue guardado.");
      suppressUnload.current = true; window.location.assign(`/cliente/caso?id=${encodeURIComponent(result.id)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Error de conexión."); }
    finally { pending.current = false; setBusy(false); }
  }

  if (loading) return <main className={styles.page}><div className={styles.shell}><p role="status" className={styles.loading}>Preparando tu solicitud privada…</p></div></main>;
  if (!selected) return <main className={styles.page}><div className={styles.shell}><p className="eyebrow">Sin registro previo</p><h1>Comienza por tu tipo de caso.</h1><p className={styles.intro}>Primero nos cuentas lo necesario. Tu correo y la creación de la cuenta se verifican al final, antes de publicar.</p>{error ? <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => window.location.reload()}>Reintentar</button></p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}<CaseTypeGrid compact={false} types={types} onChoose={(type) => { setSelected(type); window.history.replaceState(null, "", `/solicitar/?tipo=${encodeURIComponent(type.id)}`); }} /></div></main>;
  const isContact = step === selected.steps.length, isFinal = step > selected.steps.length;
  const activeStep = selected.steps[step];
  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.breadcrumb}><Link href="/#casos"><ArrowLeft size={15} /> Volver al catálogo</Link><span>Solicitud gratuita</span></div>
    <header className={styles.heading} id="intake-heading"><span className={styles.typeIcon}><CaseTypeIcon name={selected.icon} size={29} /></span><div><p className="eyebrow">{selected.category}</p><h1>{selected.topic}</h1><p>{selected.description}</p></div></header>
    {requestedType ? <div className={styles.notice}><p>Tienes un borrador de <strong>{selected.topic}</strong>. El nuevo enlace corresponde a <strong>{requestedType.topic}</strong>.</p><button type="button" className="secondary-button" onClick={() => void startOver(requestedType)} disabled={busy}>Descartar y cambiar de tipo</button></div> : null}
    <ol className={styles.progress} aria-label="Progreso de la solicitud">{[...selected.steps.map((item) => item.title), "Contacto", "Cuenta y envío"].map((title, index) => <li key={`${index}-${title}`} aria-current={index === step ? "step" : undefined} className={index < step ? styles.complete : ""}><span>{index < step ? <CheckCircle2 size={18} /> : index + 1}</span><small>{title}</small></li>)}</ol>
    <div className={styles.layout}><section className={styles.panel} aria-labelledby="active-intake-title">
      <div className={styles.panelTitle}><p className="eyebrow">Paso {step + 1} de {selected.steps.length + 2}</p><h2 id="active-intake-title">{isFinal ? "Crea tu cuenta y verifica tu correo" : isContact ? "¿Cómo podemos contactarte?" : activeStep?.title}</h2></div>
      <p className={styles.privacy}><ShieldCheck size={17} /> {isContact || isFinal ? "Tu contacto solo se comparte con el abogado cuya propuesta aceptes." : "Evita datos sensibles, nombres de terceros, RUT, claves y documentos en estas respuestas."}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {issues.length ? <div className={styles.error} role="alert"><p>Revisa estos campos para continuar:</p><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div> : null}
      {!isContact && !isFinal && activeStep ? <IntakeFields step={activeStep} answers={answers} disabled={busy} onChange={(id, value) => { setAnswers((current) => ({ ...current, [id]: value })); setNotice(""); }} /> : null}
      {isContact ? <IntakeContactFields contact={contact} onChange={setContact} disabled={busy} /> : null}
      {isFinal ? <div className={styles.final}>
        <div className={styles.review}><h3>Revisa tu solicitud</h3><dl><div><dt>Tipo</dt><dd>{selected.topic}</dd></div><div><dt>Nombre</dt><dd>{contact.fullName}</dd></div><div><dt>Zona</dt><dd>{contact.commune}, {contact.region}</dd></div><div><dt>Modalidad</dt><dd>{contact.attentionMode === "remote" ? "Online" : contact.attentionMode === "presencial" ? "Presencial" : "Presencial u online"}</dd></div></dl><details><summary>Ver mis respuestas</summary>{selected.steps.flatMap((item) => item.questions).map((question) => <div className={styles.answer} key={question.id}><p>{question.label}</p><span>{answers[question.id] || "Sin respuesta"}</span></div>)}</details></div>
        {!user ? <><p>Ahora elige el correo de tu cuenta. Guardaremos tu solicitud antes de abrir el registro y la recuperaremos al volver.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void authenticate("/auth/google/start?intent=register&role=person&next=%2Fsolicitar%2F")}><LockKeyhole size={17} /> Crear cuenta de cliente con Google</button><p className={styles.helper}>Google verifica que el correo te pertenece; tu borrador sigue privado.</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void authenticate("/registro/?next=%2Fsolicitar%2F")}>Registrarme con correo</button><button type="button" className="text-link" disabled={busy} onClick={() => void authenticate("/ingresar/?next=%2Fsolicitar%2F")}>Ya tengo una cuenta de cliente</button></>
          : user.role !== "person" ? <div className={styles.error}><p>Esta cuenta es de {user.role === "lawyer" ? "abogado" : "administración"}. Un mismo correo no puede ser cliente y abogado a la vez.</p><p>Tu borrador sigue guardado. Para publicar como cliente debes ingresar con una cuenta de cliente, o pedir a administración un cambio de rol.</p><Link href="/soporte">Contactar a soporte</Link></div>
            : !user.emailVerified ? <><p>Tu cuenta: <strong>{user.email}</strong></p><p>Antes de publicar debes verificar ese mismo correo. Por ahora puedes hacerlo vinculando tu cuenta de Google con la misma dirección.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void authenticate("/auth/google/start?intent=link&next=%2Fsolicitar%2F")}>Verificar mi correo con Google</button><p className={styles.helper}>Si tu correo no está asociado a Google, conserva el borrador y contacta a soporte. El envío de códigos por correo aún no está habilitado.</p></>
              : <><p className={styles.verified}><CheckCircle2 size={18} /> Correo verificado: {user.email}</p><label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Revisé mis respuestas y autorizo publicar los antecedentes para recibir propuestas de abogados. Mi contacto seguirá protegido hasta que acepte una propuesta. Acepto los <Link href="/terminos">términos</Link> y la <Link href="/privacidad">política de privacidad</Link>.</span></label><button type="button" className="primary-button" disabled={busy || !confirmed} onClick={() => void publish()}>{busy ? "Procesando…" : "Publicar mi solicitud"}<ArrowRight size={17} /></button></>}
      </div> : null}
      <div className={styles.actions}><button type="button" className="secondary-button" disabled={busy || step === 0} onClick={() => { setStep(Math.max(0, step - 1)); setIssues([]); scrollToForm(); }}><ArrowLeft size={16} /> Atrás</button>{!isFinal ? <button type="button" className="primary-button" disabled={busy} onClick={() => void next()}>{busy ? "Guardando…" : isContact ? "Continuar a mi cuenta" : "Guardar y continuar"}<ArrowRight size={16} /></button> : null}</div>
      <div className={styles.saveArea}><button type="button" disabled={busy || !dirty} onClick={() => void persist()}><Save size={15} /> Guardar borrador</button><p role="status">{busy ? "Guardando de forma privada…" : dirty ? "Tienes cambios sin guardar. Guarda antes de salir." : savedAt ? `Guardado a las ${savedAt}.` : "Borrador recuperado."}</p></div>
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </section><aside className={styles.aside}><h2>Primero tu caso, después tu cuenta.</h2><ol><li>Responde las preguntas de tu situación.</li><li>Deja tus datos de contacto de forma privada.</li><li>Crea o abre tu cuenta y verifica tu correo.</li><li>Publica, compara propuestas y elige a tu abogado.</li></ol><p>El borrador permanece hasta 48 horas en este navegador. No se publica automáticamente.</p><p>No guardamos estas respuestas en localStorage ni en los enlaces del navegador.</p><button type="button" className="text-link" disabled={busy} onClick={() => void startOver()}>Descartar borrador y cambiar de caso</button><Link href="/soporte">¿Necesitas ayuda?</Link></aside></div>
  </div></main>;
}
