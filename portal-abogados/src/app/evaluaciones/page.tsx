"use client";
import { useEffect, useState } from "react";
import { PortalShell } from "../../components/portal-shell";
type Review = { id: string; case_title: string; rating: number; comment: string; created_at: string };
export default function EvaluacionesPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => { void fetch("/api/reviews").then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { reviews: Review[] }; }).then((data) => setReviews(data.reviews)).catch(() => setNotice("No pudimos cargar las evaluaciones.")); }, []);
  const average = reviews.length ? (reviews.reduce((total, item) => total + item.rating, 0) / reviews.length).toFixed(1) : "—";
  return <PortalShell><div className="portal-page-heading"><div><p className="eyebrow">Reputación profesional</p><h1>Evaluaciones</h1><p>Opiniones de clientes que aceptaron tu propuesta y cerraron su caso.</p></div></div>{notice && <p role="status">{notice}</p>}<section className="portal-panel account-form"><h2>Valoración promedio: {average}/5</h2><p>{reviews.length} evaluaciones verificadas</p>{reviews.length === 0 && <p>La primera evaluación aparecerá cuando un cliente cierre un caso contigo.</p>}{reviews.map((review) => <article className="ticket-card" key={review.id}><h3>{review.case_title} · {"★".repeat(review.rating)}</h3><p>{review.comment}</p><small>{new Date(review.created_at).toLocaleDateString("es-CL")}</small></article>)}</section></PortalShell>;
}
