"use client";
import { CircleHelp, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultHelp, type HelpArticle } from "../../components/content-store";
import { TicketCenter } from "../../components/ticket-center";
export default function SupportPage() {
  const [articles, setArticles] = useState<HelpArticle[]>(defaultHelp);
  const [query, setQuery] = useState("");
  useEffect(() => { void fetch("/api/content").then(async (response) => response.ok ? await response.json() as { help?: HelpArticle[] } : null).then((data) => { if (data?.help) setArticles(data.help); }).catch(() => undefined); }, []);
  const filtered = articles.filter((article) => `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="support-page">
    <section className="support-hero" data-reveal><CircleHelp size={31} /><p className="eyebrow">Centro de ayuda</p><h1>¿Cómo podemos ayudarte?</h1><label className="support-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca en las preguntas frecuentes" /></label></section>
    <section className="support-content support-faq"><div className="section-heading" data-reveal><p className="eyebrow">Primero revisa esto</p><h2>Preguntas frecuentes</h2></div><div className="article-grid">{filtered.map((article) => <details className="article-card" key={article.id} data-reveal><summary><small>{article.category}</small><h3>{article.title}</h3></summary><p>{article.excerpt}</p></details>)}{filtered.length === 0 && <p>No encontramos una respuesta; puedes escribir un ticket abajo.</p>}</div></section>
    <section className="support-contact" data-reveal><div><p className="eyebrow">Medios de contacto</p><h2>Seguimiento sin perder el hilo</h2><p>Usa un ticket para consultas sobre tu cuenta o casos. También puedes escribir a <a href="mailto:hola@jurisconecta.cl">hola@jurisconecta.cl</a>; el correo no se sincroniza automáticamente con tickets.</p></div><a className="secondary-button" href="#mis-tickets">Crear un ticket</a></section>
    <TicketCenter />
  </main>;
}
