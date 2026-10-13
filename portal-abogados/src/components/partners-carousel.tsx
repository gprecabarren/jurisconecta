"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PublicPartner, PartnerCategory } from "../../shared/partners";
import styles from "./partners-carousel.module.css";

function PartnerRow({ partners, category, title }: { partners: PublicPartner[]; category: PartnerCategory; title: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ atStart: true, atEnd: false });
  const headingId = `aliados-${category}`;
  function updatePosition() {
    const element = track.current;
    if (element) setPosition({ atStart: element.scrollLeft <= 2, atEnd: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
  }
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(updatePosition);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function move(direction: number) {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * Math.max(220, element.clientWidth * .75), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function keyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); track.current?.scrollTo({ left: event.key === "Home" ? 0 : track.current.scrollWidth }); }
  }
  return <div className={styles.row} role="region" aria-labelledby={headingId} aria-roledescription="carrusel">
    <div className={styles.rowHeader}><h3 id={headingId}>{title}</h3><div className={styles.controls}>
      <button type="button" aria-label={`Ver anteriores: ${title}`} aria-controls={`${headingId}-lista`} disabled={position.atStart} onClick={() => move(-1)}><ChevronLeft size={20} /></button>
      <button type="button" aria-label={`Ver siguientes: ${title}`} aria-controls={`${headingId}-lista`} disabled={position.atEnd} onClick={() => move(1)}><ChevronRight size={20} /></button>
    </div></div>
    <ul className={styles.track} id={`${headingId}-lista`} ref={track} tabIndex={0} aria-label={`${title}. Desliza o usa las flechas del teclado.`} onKeyDown={keyDown} onScroll={updatePosition}>
      {partners.map((partner) => <li className={styles.card} key={partner.id}>
        {partner.linkUrl ? <a href={partner.linkUrl} target="_blank" rel="noopener noreferrer" aria-label={`${partner.name} (se abre en otra pestaña)`}>
          {/* Bounded first-party logo endpoint; no paid image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partner.imageUrl} alt={partner.alt} width={180} height={72} loading="lazy" decoding="async" /><span>{partner.name}</span>
        </a> : <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={partner.imageUrl} alt={partner.alt} width={180} height={72} loading="lazy" decoding="async" /><span>{partner.name}</span>
        </div>}
      </li>)}
    </ul>
  </div>;
}

export function PartnersCarousel() {
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/partners", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { partners?: PublicPartner[] };
      if (!controller.signal.aborted && Array.isArray(data.partners)) setPartners(data.partners);
    }).catch(() => { /* Optional section stays hidden on unavailable content. */ });
    return () => controller.abort();
  }, []);
  if (partners.length === 0) return null;
  const companies = partners.filter((partner) => partner.category === "company");
  const firms = partners.filter((partner) => partner.category === "law_firm");
  return <section className={`section-shell ${styles.section}`} aria-labelledby="aliados-title" id="aliados">
    <div className="section-heading centered"><p className="eyebrow">Colaboraciones</p><h2 id="aliados-title">Experiencia que construimos juntos</h2><p>Empresas y estudios jurídicos con los que hemos trabajado.</p></div>
    {companies.length > 0 ? <PartnerRow partners={companies} category="company" title="Empresas" /> : null}
    {firms.length > 0 ? <PartnerRow partners={firms} category="law_firm" title="Estudios jurídicos" /> : null}
  </section>;
}
