"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalShell } from "../../components/portal-shell";
import { NoticeCenter } from "../../components/notice-center";
type Proposal = { id: string; case_title: string; status: string; created_at: string };
type Review = { id: string; rating: number };
type Profile = { full_name: string; application_status: string; credit_balance: number };
export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => { void Promise.all([fetch("/api/lawyer/profile"), fetch("/api/lawyer/proposals"), fetch("/api/reviews")]).then(async ([a, b, d]) => {
    if (![a, b, d].every((response) => response.ok)) throw new Error();
    setProfile((await a.json() as { profile: Profile }).profile);
    setProposals((await b.json() as { proposals: Proposal[] }).proposals);
    setReviews((await d.json() as { reviews: Review[] }).reviews);
  }).catch(() => setNotice("No pudimos cargar toda la actividad.")); }, []);
  const accepted = proposals.filter((proposal) => proposal.status === "accepted").length;
  const average = reviews.length ? (reviews.reduce((total, review) => total + review.rating, 0) / reviews.length).toFixed(1) : "Sin evaluaciones";
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">Panel profesional</p><h1>{profile ? `Hola, ${profile.full_name.split(" ")[0]}.` : "Tu actividad"}</h1><p>Propuestas, contactos y avisos reales de tu cuenta.</p></div><Link className="portal-outline-button" href="/account">Editar mi perfil</Link></div>{notice && <p role="status" className="save-confirmation">{notice}</p>}{profile?.application_status !== "approved" && <p className="application-note">Tu perfil aún no está aprobado. <Link href="/postulacion-abogado">Revisar postulación</Link></p>}<section className="metric-grid"><article><p>Propuestas enviadas</p><strong>{proposals.length}</strong><small>{accepted} aceptadas</small></article><article><p>Contactos habilitados</p><strong>{accepted}</strong><small>Solo tras aceptación del cliente y uso de créditos</small></article><article><p>Valoración promedio</p><strong>{average}</strong><small>{reviews.length} evaluaciones verificadas</small></article></section><div className="dashboard-grid"><section className="portal-panel account-form"><h2>Mis propuestas recientes</h2>{proposals.length === 0 && <p>Aún no has enviado propuestas.</p>}{proposals.slice(0, 5).map((proposal) => <div className="notice-row" key={proposal.id}><b>{proposal.case_title}</b><span className="state-chip">{proposal.status === "accepted" ? "Aceptada" : proposal.status === "declined" ? "Descartada" : "Pendiente"}</span></div>)}<Link className="portal-primary-button" href="/casos/propuestas">Ver todas</Link></section><NoticeCenter /></div></PortalShell>;
}
