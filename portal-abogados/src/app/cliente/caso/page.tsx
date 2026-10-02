"use client";
/* eslint-disable @next/next/no-img-element -- Images are small validated data URLs; no image CDN is used. */
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClientShell } from "../../../components/client-shell";
type LegalCase = { id: string; title: string; category: string; description: string; status: string; created_at: string; view_count: number; proposal_count: number; accepted_count: number };
type Proposal = { id: string; message: string; fee_amount: number | null; status: string; created_at: string; lawyer_name: string; avatar_data_url: string | null; region: string | null; bio: string | null; university: string | null; experience_years: number | null; rating: number; review_count: number };
type Review = { case_id: string; rating: number; comment: string };
export default function ClientCasePage() { return <Suspense fallback={<ClientShell><p>Cargando caso...</p></ClientShell>}><ClientCaseContent /></Suspense>; }
function ClientCaseContent() {
  const id = useSearchParams().get("id") || "";
  const [legalCase, setCase] = useState<LegalCase | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!id) return;
    const [a, b, c] = await Promise.all([fetch("/api/cases"), fetch(`/api/client/proposals?caseId=${encodeURIComponent(id)}`), fetch("/api/reviews")]);
    if (!a.ok || !b.ok || !c.ok) throw new Error("No pudimos cargar este caso.");
    const cases = await a.json() as { cases: LegalCase[] };
    const proposalData = await b.json() as { proposals: Proposal[] };
    const reviews = await c.json() as { reviews: Review[] };
    setCase(cases.cases.find((item) => item.id === id) || null); setProposals(proposalData.proposals); setReview(reviews.reviews.find((item) => item.case_id === id) || null);
  }
  // Async loading updates state only after the network response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Error al cargar.")); }, [id]);
  async function choose(proposalId: string, action: "accept" | "decline") {
    if (action === "accept" && !window.confirm("¿Aceptas esta propuesta? Las demás quedarán descartadas y el abogado elegido podrá desbloquear tu contacto con créditos de prueba.")) return;
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/client/proposals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId, action }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "No pudimos actualizar la propuesta."); setNotice(action === "accept" ? "Propuesta aceptada. El profesional podrá ponerse en contacto contigo." : "Propuesta descartada."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al actualizar."); } finally { setBusy(false); }
  }
  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setNotice("");
    try { const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, rating: Number(form.get("rating")), comment: form.get("comment") }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "No pudimos publicar tu evaluación."); setNotice("Evaluación publicada."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error al publicar."); } finally { setBusy(false); }
  }
  const stages = [{ label: "Publicado", done: Boolean(legalCase) }, { label: "Propuestas recibidas", done: proposals.length > 0 }, { label: "Profesional elegido", done: Boolean(legalCase?.accepted_count) }, { label: "Caso cerrado", done: legalCase?.status === "closed" }];
  return <ClientShell><div className="portal-page-heading"><div><p className="eyebrow">Seguimiento de caso</p><h1>{legalCase?.title || "Mi caso"}</h1><p>Tu panel de avance, propuestas y evaluación final.</p></div><Link className="portal-outline-button" href="/cliente">Todos mis casos</Link></div>{notice && <p role="status" className="save-confirmation">{notice}</p>}{!id ? <p>Falta el identificador del caso.</p> : !legalCase ? <p>Cargando caso...</p> : <div className="settings-stack"><section className="portal-panel account-form"><h2>Estado y estadísticas</h2><div className="case-progress">{stages.map((stage) => <span className={stage.done ? "done" : ""} key={stage.label}>{stage.done ? "✓ " : "○ "}{stage.label}</span>)}</div><div className="metric-grid"><article><p>Visualizaciones</p><strong>{legalCase.view_count}</strong></article><article><p>Propuestas</p><strong>{legalCase.proposal_count}</strong></article><article><p>Estado</p><strong>{legalCase.status === "closed" ? "Cerrado" : legalCase.status === "matched" ? "En contacto" : "Abierto"}</strong></article></div><h3>Lo que publicaste</h3><p>{legalCase.description}</p><small>Publicado {new Date(legalCase.created_at).toLocaleDateString("es-CL")}</small></section><section className="portal-panel account-form"><h2>Compara propuestas</h2><p>Revisa trayectoria, ubicación, honorarios orientativos y mensaje antes de elegir. Tu contacto no se revela hasta que aceptes.</p>{proposals.length === 0 && <p>Aún no llegan propuestas. Te avisaremos aquí cuando haya novedades.</p>}<div className="proposal-list">{proposals.map((proposal) => <article className="proposal-card" key={proposal.id}><div className="ticket-card-head">{proposal.avatar_data_url ? <img className="profile-avatar-image" src={proposal.avatar_data_url} alt="" /> : <span className="profile-avatar">{proposal.lawyer_name.slice(0, 2)}</span>}<div><h3>{proposal.lawyer_name}</h3><small>{proposal.region || "Atención remota"} · {proposal.university || "Formación por verificar"} · {proposal.experience_years ?? "—"} años de experiencia</small><p>Valoración: {proposal.review_count ? `${Number(proposal.rating).toFixed(1)}/5 (${proposal.review_count})` : "Aún sin evaluaciones"}</p></div></div><p>{proposal.message}</p><p><b>Honorarios indicativos:</b> {proposal.fee_amount === null ? "A conversar" : `$${proposal.fee_amount.toLocaleString("es-CL")}`}</p><p><small>{proposal.bio}</small></p><span className="state-chip">{proposal.status === "accepted" ? "Aceptada" : proposal.status === "declined" ? "Descartada" : "Pendiente"}</span>{proposal.status === "sent" && legalCase.status === "open" && <div className="proposal-actions"><button className="portal-primary-button" disabled={busy} onClick={() => void choose(proposal.id, "accept")}>Aceptar propuesta</button><button className="portal-outline-button" disabled={busy} onClick={() => void choose(proposal.id, "decline")}>Descartar</button></div>}</article>)}</div></section>{legalCase.status === "closed" && legalCase.accepted_count > 0 && <section className="portal-panel account-form"><h2>Evalúa tu experiencia</h2>{review ? <p>Publicaste {review.rating}/5 estrellas: {review.comment}</p> : <form onSubmit={submitReview}><label>Valoración<select name="rating" required><option value="5">5 estrellas</option><option value="4">4 estrellas</option><option value="3">3 estrellas</option><option value="2">2 estrellas</option><option value="1">1 estrella</option></select></label><label>Comentario<textarea name="comment" minLength={20} maxLength={1000} required rows={4} /></label><button className="portal-primary-button" disabled={busy}>Publicar evaluación</button></form>}</section>}<Link className="portal-outline-button" href="/soporte/#mis-tickets">¿Necesitas ayuda? Abrir un ticket</Link></div>}</ClientShell>;
}
