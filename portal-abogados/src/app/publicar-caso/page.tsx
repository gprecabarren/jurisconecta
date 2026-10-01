"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, MapPin, Send, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ClientShell } from "../../components/client-shell";
import { categoryForTopic, legalAreas, questionsForTopic } from "../../components/legal-matters";
import { chileRegions } from "../../../shared/chile";

type Profile = { region: string | null; commune: string | null; };
type Details = { firstAnswer: string; secondAnswer: string; summary: string; desiredOutcome: string; attentionMode: string; region: string; commune: string; };

const defaultDetails: Details = { firstAnswer: "", secondAnswer: "", summary: "", desiredOutcome: "", attentionMode: "remote", region: "", commune: "" };

export default function PublishCasePage() {
  const [step, setStep] = useState(1);
  const [area, setArea] = useState(legalAreas[0]);
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState<Details>(defaultDetails);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const questions = useMemo(() => questionsForTopic(topic), [topic]);
  const caseCategory = categoryForTopic(area.title, topic);
  useEffect(() => { void fetch("/api/auth/me").then(async (response) => response.ok ? await response.json() as { user?: Profile } : null).then((result) => { if (result?.user) setDetails((current) => ({ ...current, region: current.region || result.user?.region || "", commune: current.commune || result.user?.commune || "" })); }).catch(() => undefined); }, []);

  function chooseArea(nextArea: typeof area) { setArea(nextArea); setTopic(""); }
  function continueDetails(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!topic) return; setStep(3); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function publish() {
    if (!topic) return;
    setSaving(true);
    setNotice("");
    const situation = `${questions[0]}\n${details.firstAnswer}\n\n${questions[1]}\n${details.secondAnswer}\n\nDescripción adicional\n${details.summary}`;
    try {
      const response = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: caseCategory, topic, situation, desiredOutcome: details.desiredOutcome, attentionMode: details.attentionMode, region: details.region, commune: details.commune }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos publicar tu caso.");
      setStep(4);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos publicar tu caso."); } finally { setSaving(false); }
  }

  if (step === 4) return <ClientShell><section className="portal-panel case-success"><span className="empty-mark"><CheckCircle2 size={28} /></span><p className="eyebrow">Caso publicado</p><h1>Tu solicitud ya está en revisión.</h1><p>Podrás seguir el estado desde tu panel cuando se habiliten coincidencias y propuestas.</p><Link className="portal-primary-button" href="/cliente">Ir a mis casos <ArrowRight size={17} /></Link></section></ClientShell>;
  return <ClientShell><div className="portal-page-heading publish-heading"><div><p className="eyebrow">Nueva solicitud</p><h1>Publica tu caso.</h1><p>Elige la materia correcta y comparte solo lo necesario para recibir orientación.</p></div><div className="publish-steps" aria-label={`Paso ${step} de 3`}><span className={step >= 1 ? "current" : ""}>1</span><i /><span className={step >= 2 ? "current" : ""}>2</span><i /><span className={step >= 3 ? "current" : ""}>3</span></div></div>{step === 1 && <section className="publish-layout"><aside className="publish-area-menu" aria-label="Áreas legales">{legalAreas.map((item) => <button key={item.title} className={area.title === item.title ? "active" : ""} onClick={() => chooseArea(item)}><span>{item.title}</span><ChevronRight size={17} /></button>)}</aside><div className="publish-topic-panel"><div className="panel-title"><div><p className="eyebrow">Paso 1</p><h2>Selecciona tu tipo de caso</h2></div><span className="content-count">{area.title}</span></div><div className="publish-topic-grid">{area.topics.map((item) => <button key={item} className={topic === item ? "selected" : ""} onClick={() => setTopic(item)}>{item}<ChevronRight size={17} /></button>)}</div><button className="portal-primary-button publish-next" disabled={!topic} onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Continuar <ArrowRight size={17} /></button></div></section>}{step === 2 && <section className="portal-panel case-details-panel"><div className="panel-title"><div><p className="eyebrow">Paso 2 · {caseCategory}</p><h2>{topic}</h2></div><span className="case-private"><ShieldCheck size={16} /> Visible para profesionales</span></div><p className="case-details-intro">No incluyas RUT, claves, datos bancarios ni documentos en esta primera descripción.</p><form className="case-details-form" onSubmit={continueDetails}><label>{questions[0]}<textarea required minLength={8} rows={3} value={details.firstAnswer} onChange={(event) => setDetails({ ...details, firstAnswer: event.target.value })} placeholder="Escribe una respuesta breve" /></label><label>{questions[1]}<textarea required minLength={8} rows={3} value={details.secondAnswer} onChange={(event) => setDetails({ ...details, secondAnswer: event.target.value })} placeholder="Escribe una respuesta breve" /></label><label>Describe brevemente tu caso<textarea required minLength={30} rows={5} value={details.summary} onChange={(event) => setDetails({ ...details, summary: event.target.value })} placeholder="Explica lo que pasó sin incluir datos sensibles" /></label><label>¿Qué estás buscando?<textarea required minLength={10} rows={3} value={details.desiredOutcome} onChange={(event) => setDetails({ ...details, desiredOutcome: event.target.value })} placeholder="Ej. Evaluar mis alternativas y los próximos pasos" /></label><div className="form-grid three"><label>Región<select required value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option value="">Selecciona una región</option>{chileRegions.map((region) => <option key={region}>{region}</option>)}</select></label><label>Comuna<input value={details.commune} onChange={(event) => setDetails({ ...details, commune: event.target.value })} placeholder="Tu comuna" /></label><label>Modalidad<select value={details.attentionMode} onChange={(event) => setDetails({ ...details, attentionMode: event.target.value })}><option value="remote">Remota</option><option value="presencial">Presencial</option><option value="cualquiera">Me da igual</option></select></label></div><div className="form-actions"><button type="button" className="back-button" onClick={() => setStep(1)}><ArrowLeft size={17} /> Volver</button><button className="portal-primary-button">Revisar solicitud <ArrowRight size={17} /></button></div></form></section>}{step === 3 && <section className="portal-panel case-review-panel"><div><p className="eyebrow">Paso 3</p><h2>Revisa antes de publicar.</h2><p>Los profesionales verán la materia, tu descripción y la zona de atención; tus datos de contacto solo pueden ser desbloqueados por abogados aprobados mediante créditos de prueba.</p></div><dl><div><dt>Materia</dt><dd>{caseCategory}</dd></div><div><dt>Tipo de caso</dt><dd>{topic}</dd></div><div><dt>Atención</dt><dd>{details.attentionMode === "remote" ? "Remota" : details.attentionMode === "presencial" ? "Presencial" : "Sin preferencia"}</dd></div><div><dt>Ubicación</dt><dd><MapPin size={15} /> {details.commune || details.region || "Sin preferencia"}</dd></div></dl>{notice && <p className="form-message">{notice}</p>}<div className="form-actions"><button type="button" className="back-button" onClick={() => setStep(2)}><ArrowLeft size={17} /> Editar detalles</button><button className="portal-primary-button" disabled={saving} onClick={publish}><Send size={17} /> {saving ? "Publicando..." : "Publicar caso"}</button></div></section>}</ClientShell>;
}
