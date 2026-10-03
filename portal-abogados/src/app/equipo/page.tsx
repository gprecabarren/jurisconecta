"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultTeam, type TeamMember } from "../../components/content-store";

export default function EquipoPage() {
  const [team, setTeam] = useState<TeamMember[]>(defaultTeam);
  useEffect(() => {
    let active = true;
    async function loadTeam() {
      try {
        const response = await fetch("/api/content");
        const content = await response.json() as { team?: TeamMember[] };
        if (active && Array.isArray(content.team)) setTeam(content.team);
      } catch { /* Keep the embedded fallback available offline. */ }
    }
    void loadTeam();
    return () => { active = false; };
  }, []);
  return <main className="public-content-page"><section className="content-hero" data-reveal><p className="eyebrow">Personas detrás de la plataforma</p><h1>Una forma más clara de conectar con orientación legal.</h1><p>Construimos JurisConecta para que encontrar apoyo jurídico sea una experiencia cercana, informada y respetuosa.</p></section><section className="team-grid">{team.map((member) => <article className="team-card" key={member.id} data-reveal><span className="team-photo">{member.initials}</span><p className="eyebrow">{member.role}</p><h2>{member.name}</h2><p>{member.bio}</p></article>)}</section><section className="content-cta" data-reveal><div><p className="eyebrow">Trabajemos juntos</p><h2>¿Eres abogado o abogada?</h2><p>Construye un perfil profesional y recibe oportunidades acordes a tu práctica.</p></div><Link className="primary-button" href="/registro?tipo=abogado">Crear perfil <ArrowRight size={18} /></Link></section></main>;
}
