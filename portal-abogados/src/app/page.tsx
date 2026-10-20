"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  FileText,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PartnersCarousel } from "@/components/partners-carousel";
import { CaseTypeGrid } from "@/components/case-type-grid";
import { BrandLogo } from "@/components/brand-logo";

const steps = [
  { icon: FileText, title: "Cuéntanos tu caso", copy: "Selecciona una materia y responde algunas preguntas simples. Publicar es gratis; evita incluir datos sensibles en la descripción." },
  { icon: MessageSquareText, title: "Compara propuestas", copy: "Hasta tres profesionales aprobados pueden proponerte una solución. Entra a tu panel para conocer su experiencia y comparar." },
  { icon: BadgeCheck, title: "Acepta y sigue tu caso", copy: "Solo el abogado que eliges puede desbloquear tu contacto. Sigue el avance y evalúa tu experiencia desde tu cuenta." },
];

export default function Home() {
  return (
    <main>

      <section className="hero">
        <div className="hero-copy" data-reveal data-reveal-from="left">
          <p className="eyebrow">Orientación legal en Chile</p>
          <h1>Encuentra abogados en Chile para tu caso.</h1>
          <p className="hero-description">Publica gratis tu situación legal, compara propuestas de profesionales revisados y sigue el avance desde tu cuenta.</p>
          <ul className="hero-points">
            <li><Check size={17} /> Publicación gratuita; contacto protegido</li>
            <li><Check size={17} /> Atención presencial u online</li>
            <li><Check size={17} /> Profesionales con perfiles revisados</li>
          </ul>
          <Link className="primary-button" href="/#casos">Cuéntanos tu caso <ArrowRight size={18} /></Link>
        </div>
        <div className="hero-brand-visual" data-reveal data-reveal-from="right"><BrandLogo variant="vertical" fetchPriority="high" /></div>
      </section>

      <PartnersCarousel />

      <section id="como-funciona" className="how-section section-shell">
        <div className="section-heading centered" data-reveal data-reveal-from="left">
          <p className="eyebrow">Así de simple</p>
          <h2>Una forma clara de comenzar</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return <article className="step" key={step.title} data-reveal data-reveal-from={index % 2 === 0 ? "left" : "right"}>
              <span className="step-number">0{index + 1}</span>
              <span className="step-icon"><Icon size={24} /></span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>;
          })}
        </div>
      </section>

      <section id="casos" className="finder-section">
        <div className="section-shell">
          <div className="section-heading finder-heading" data-reveal data-reveal-from="right">
            <div>
              <p className="eyebrow">Primer paso</p>
              <h2>¿Qué situación necesitas resolver?</h2>
            </div>
            <p>Elige tu tipo de caso y comienza sin registrarte. Al final crearás tu cuenta y verificarás tu correo para publicarlo.</p>
          </div>
          <CaseTypeGrid />
        </div>
      </section>

      <section id="confianza" className="trust-section section-shell">
        <div className="trust-copy" data-reveal data-reveal-from="left">
          <p className="eyebrow">Hecho para decidir informado</p>
          <h2>Tu información se trata con seriedad.</h2>
          <p>No somos un estudio jurídico ni reemplazamos el consejo profesional. Somos el espacio para que personas y abogados se encuentren con contexto y transparencia.</p>
          <Link href="/registro" className="text-link">Crear una cuenta <ArrowRight size={16} /></Link>
        </div>
        <div className="trust-cards">
          <article data-reveal data-reveal-from="right"><ShieldCheck size={24} /><h3>Contacto protegido</h3><p>Solo el profesional que aceptas puede desbloquear tu contacto con créditos de prueba.</p></article>
          <article data-reveal data-reveal-from="left"><MapPin size={24} /><h3>Cobertura nacional</h3><p>Indica región, comuna y modalidad de atención al publicar tu solicitud.</p></article>
          <article data-reveal data-reveal-from="right"><BriefcaseBusiness size={24} /><h3>Revisión profesional</h3><p>Los abogados deben pasar una aprobación antes de acceder al contacto de las personas.</p></article>
        </div>
      </section>

      <section className="join-section">
        <div className="section-shell join-layout" data-reveal data-reveal-from="right">
          <div><Sparkles size={25} /><h2>¿Eres abogado o abogada?</h2><p>Crea un perfil profesional, define tus materias y recibe oportunidades relevantes.</p></div>
          <Link className="secondary-button" href="/registro?tipo=abogado">Crear perfil profesional <ArrowRight size={18} /></Link>
        </div>
      </section>

    </main>
  );
}
