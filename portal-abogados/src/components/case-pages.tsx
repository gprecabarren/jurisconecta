"use client";

import Link from "next/link";
import { ArrowRight, Clock3, ContactRound, LockKeyhole, Mail, MapPin, Phone, Search, Send, Star, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "./portal-shell";

type LegalCase = { id: string; category: string; title: string; description: string; region: string | null; status: string; created_at: string; attention_mode: string | null; commune: string | null; credit_cost: number; contact_accessed: number; preferred: number; contact_name: string | null; contact_email: string | null; contact_phone: string | null; contact_region: string | null; contact_commune: string | null; };
type Proposal = { id: string; case_id: string; case_title: string; category: string; message: string; fee_amount: number | null; status: string; created_at: string; credit_cost: number; };

function timeAgo(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(`${value.replace(" ", "T")}Z`).getTime()) / 86400000));
  return days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days} días`;
}

function ContactBlock({ item }: { item: LegalCase }) {
  return <div className="case-contact"><p><ContactRound size={14} /> {item.contact_name}</p><p><Mail size={14} /> <a href={`mailto:${item.contact_email || ""}`}>{item.contact_email}</a></p><p><Phone size={14} /> {item.contact_phone ? <a href={`tel:${item.contact_phone}`}>{item.contact_phone}</a> : "Sin teléfono"}</p><p><MapPin size={14} /> {item.contact_commune || item.contact_region || "Ubicación por definir"}</p></div>;
}

function CaseCard({ item, submitted, onSubmitted }: { item: LegalCase; submitted: boolean; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/lawyer/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: item.id, message, feeAmount: fee === "" ? null : Number(fee) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos enviar la propuesta.");
      setOpen(false); onSubmitted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos enviar la propuesta."); }
    finally { setBusy(false); }
  }
  return <article className="case-list-card case-live-card">
    <div className="case-card-top"><span className="case-category">{item.category}</span><span className="credit-chip">{item.credit_cost} créditos si el cliente acepta</span></div>
    <h2>{item.title}</h2><p><MapPin size={15} /> {item.commune || item.region || "Atención flexible"} · {item.attention_mode === "remote" ? "Remota" : item.attention_mode === "presencial" ? "Presencial" : "Flexible"}</p>
    <p className="case-description">{item.description.slice(0, 300)}{item.description.length > 300 ? "…" : ""}</p>
    {error && <p className="form-message" role="alert">{error}</p>}
    {open && !submitted && <form className="proposal-form" onSubmit={send}><label>Tu propuesta para la persona<textarea required minLength={30} maxLength={1500} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Explica tu experiencia, cómo abordarías el caso y los próximos pasos. No solicites datos sensibles aquí." /></label><label>Honorarios estimados en CLP (opcional; el sitio no cobra)<input type="number" min="0" max="100000000" step="1" value={fee} onChange={(event) => setFee(event.target.value)} /></label><button className="portal-primary-button" disabled={busy}><Send size={15} /> {busy ? "Enviando…" : "Enviar propuesta"}</button></form>}
    <footer><span><Clock3 size={14} /> {timeAgo(item.created_at)}</span>{submitted ? <span className="contact-ready">Propuesta enviada</span> : <button className="portal-primary-button" type="button" onClick={() => setOpen(!open)}>{open ? "Ocultar formulario" : "Proponer"} <ArrowRight size={15} /></button>}</footer>
  </article>;
}

function CasesView({ view }: { view: "pool" | "preferred" | "accessed" }) {
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseResponse, proposalResponse] = await Promise.all([fetch(`/api/lawyer/cases?view=${view}`), fetch("/api/lawyer/proposals")]);
      const caseData = await caseResponse.json() as { cases?: LegalCase[]; error?: string };
      const proposalData = await proposalResponse.json() as { proposals?: Proposal[] };
      if (!caseResponse.ok) throw new Error(caseData.error || "No pudimos cargar casos.");
      setCases(caseData.cases || []); setSent((proposalData.proposals || []).map((proposal) => proposal.case_id));
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "No pudimos cargar casos."); }
    finally { setLoading(false); }
  }, [view]);
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => cases.filter((item) => `${item.title} ${item.category} ${item.region || ""}`.toLowerCase().includes(query.toLowerCase())), [cases, query]);
  const heading = view === "pool" ? ["Oportunidades disponibles", "Casos del pool", "Envía una propuesta; el contacto se protege hasta que la persona te elija."] : view === "preferred" ? ["Coincidencias profesionales", "Casos preferentes", "Casos que coinciden con tus especialidades."] : ["Historial profesional", "Contactos autorizados", "Casos en los que el cliente aceptó y desbloqueaste el contacto."];
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">{heading[0]}</p><h1>{heading[1]}</h1><p>{heading[2]}</p></div><Link className="portal-outline-button" href="/casos/propuestas">Mis propuestas <ArrowRight size={16} /></Link></div>{notice && <p className="form-message" role="status">{notice}</p>}
    <section className="case-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por materia o región" /></label><span>{loading ? "Cargando…" : `${visible.length} oportunidades`}</span></section>
    {!loading && !visible.length ? <section className="portal-panel preferred-empty"><span className="empty-mark">{view === "preferred" ? <Star size={29} /> : <UsersRound size={29} />}</span><h2>{view === "accessed" ? "Todavía no hay contactos autorizados." : "No hay casos que coincidan ahora."}</h2><p>Las oportunidades cambian cuando las personas publican solicitudes.</p>{view !== "pool" && <Link className="portal-primary-button" href="/casos/pool">Explorar el pool <ArrowRight size={17} /></Link>}</section> : <div className="case-list-grid">{visible.map((item) => view === "accessed" ? <article className="case-list-card case-live-card" key={item.id}><h2>{item.title}</h2><p>{item.category} · {item.region}</p><ContactBlock item={item} /></article> : <CaseCard key={item.id} item={item} submitted={sent.includes(item.id)} onSubmitted={() => { setSent((current) => [...current, item.id]); setNotice("Propuesta enviada. Te avisaremos dentro del sitio si la persona la acepta."); }} />)}</div>}
  </PortalShell>;
}

export function PoolCasesPage() { return <CasesView view="pool" />; }
export function PreferredCasesPage() { return <CasesView view="preferred" />; }
export function AccessedCasesPage() { return <CasesView view="accessed" />; }

export function LawyerProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  async function load() { const response = await fetch("/api/lawyer/proposals"); if (response.ok) setProposals((await response.json() as { proposals: Proposal[] }).proposals); }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);
  async function unlock(proposal: Proposal) {
    setBusy(proposal.id); setNotice("");
    try { const response = await fetch("/api/lawyer/cases?action=access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: proposal.case_id }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos desbloquear el contacto."); setNotice("Contacto autorizado y disponible en Casos accedidos."); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "No pudimos desbloquear el contacto."); }
    finally { setBusy(""); }
  }
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">Tu actividad</p><h1>Mis propuestas</h1><p>Solo puedes ver el contacto después de que la persona acepte tu propuesta.</p></div></div>{notice && <p className="form-message" role="status">{notice}</p>}<div className="ticket-list">{proposals.map((proposal) => <article className="portal-panel ticket-card" key={proposal.id}><span className="case-category">{proposal.category} · {proposal.status === "accepted" ? "Aceptada" : proposal.status === "declined" ? "No seleccionada" : "Pendiente"}</span><h2>{proposal.case_title}</h2><p>{proposal.message}</p>{proposal.fee_amount !== null && <p>Honorarios estimados: {proposal.fee_amount.toLocaleString("es-CL")} CLP</p>}{proposal.status === "accepted" && <button className="portal-primary-button" disabled={busy === proposal.id} onClick={() => unlock(proposal)}><LockKeyhole size={16} /> {busy === proposal.id ? "Desbloqueando…" : `Ver contacto (${proposal.credit_cost} créditos)`}</button>}</article>)}{!proposals.length && <p>Aún no has enviado propuestas.</p>}</div></PortalShell>;
}
