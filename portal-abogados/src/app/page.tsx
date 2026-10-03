"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileText,
  Gavel,
  MapPin,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

const areas = [
  { title: "Familia", cases: ["Pensión de alimentos", "Divorcio", "Régimen de visitas", "Violencia intrafamiliar"] },
  { title: "Civil", cases: ["Herencias y posesiones efectivas", "Deudas y embargos", "Arriendo y propiedades", "Problemas entre vecinos"] },
  { title: "Laboral", cases: ["Despido injustificado", "Defensa de derechos laborales", "Accidentes del trabajo", "Cobro de prestaciones"] },
  { title: "Penal", cases: ["Accidentes de tránsito", "Robos y hurtos", "Injurias y calumnias", "Delitos económicos"] },
];

const steps = [
  { icon: FileText, title: "Cuéntanos tu caso", copy: "Selecciona una materia y responde algunas preguntas simples. Publicar es gratis; evita incluir datos sensibles en la descripción." },
  { icon: MessageSquareText, title: "Compara propuestas", copy: "Hasta tres profesionales aprobados pueden proponerte una solución. Entra a tu panel para conocer su experiencia y comparar." },
  { icon: BadgeCheck, title: "Acepta y sigue tu caso", copy: "Solo el abogado que eliges puede desbloquear tu contacto. Sigue el avance y evalúa tu experiencia desde tu cuenta." },
];

export default function Home() {
  const [selectedArea, setSelectedArea] = useState(areas[0]);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);

  return (
    <main>

      <section className="hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Orientación legal en Chile</p>
          <h1>Encuentra la ayuda legal que necesitas.</h1>
          <p className="hero-description">Describe tu situación y conecta con profesionales que trabajan en la materia y zona que necesitas.</p>
          <ul className="hero-points">
            <li><Check size={17} /> Publicación gratuita; contacto protegido</li>
            <li><Check size={17} /> Atención presencial u online</li>
            <li><Check size={17} /> Profesionales con perfiles revisados</li>
          </ul>
          <Link className="primary-button" href="/registro">Encontrar un abogado <ArrowRight size={18} /></Link>
        </div>
        <div className="hero-panel" aria-label="Resumen de solicitud legal" data-reveal>
          <div className="panel-topline"><span className="status-dot" />Solicitud en pocos pasos</div>
          <div className="panel-body">
            <span className="panel-icon"><Gavel size={28} /></span>
            <h2>Tu caso merece una buena primera conversación.</h2>
            <p>Te ayudamos a partir con la especialidad correcta, sin comprometerte.</p>
          </div>
          <div className="panel-stats">
            <span><strong>3 pasos</strong> para publicar</span>
            <span><strong>Chile</strong> atención nacional</span>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="how-section section-shell">
        <div className="section-heading centered" data-reveal>
          <p className="eyebrow">Así de simple</p>
          <h2>Una forma clara de comenzar</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return <article className="step" key={step.title} data-reveal>
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
          <div className="section-heading finder-heading" data-reveal>
            <div>
              <p className="eyebrow">Primer paso</p>
              <h2>¿En qué necesitas apoyo?</h2>
            </div>
            <p>Elige una categoría y luego el tipo de caso. Podrás entregar más detalles después.</p>
          </div>
          <div className="finder-layout" data-reveal>
            <div className="area-menu" role="tablist" aria-label="Áreas legales">
              {areas.map((area) => (
                <button
                  className={selectedArea.title === area.title ? "area-item active" : "area-item"}
                  key={area.title}
                  onClick={() => { setSelectedArea(area); setSelectedCase(null); }}
                  role="tab"
                  aria-selected={selectedArea.title === area.title}
                >
                  <span>{area.title}</span><ChevronRight size={18} />
                </button>
              ))}
              <Link className="area-item all-cases" href="/encuentra-abogado"><span>Ver todas las materias</span><Search size={17} /></Link>
            </div>
            <div className="case-grid" aria-live="polite">
              {selectedArea.cases.map((caseName) => (
                <button
                  className={selectedCase === caseName ? "case-card selected" : "case-card"}
                  key={caseName}
                  onClick={() => setSelectedCase(caseName)}
                >
                  <span>{caseName}</span>
                  <ArrowRight size={18} />
                </button>
              ))}
              <Link className="case-cta" href={selectedCase ? `/registro?caso=${encodeURIComponent(selectedCase)}` : "/registro"}>
                <span>{selectedCase ? `Continuar con: ${selectedCase}` : "Selecciona un caso para continuar"}</span>
                <ArrowRight size={19} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="confianza" className="trust-section section-shell">
        <div className="trust-copy" data-reveal>
          <p className="eyebrow">Hecho para decidir informado</p>
          <h2>Tu información se trata con seriedad.</h2>
          <p>No somos un estudio jurídico ni reemplazamos el consejo profesional. Somos el espacio para que personas y abogados se encuentren con contexto y transparencia.</p>
          <Link href="/registro" className="text-link">Crear una cuenta <ArrowRight size={16} /></Link>
        </div>
        <div className="trust-cards">
          <article data-reveal><ShieldCheck size={24} /><h3>Contacto protegido</h3><p>Solo el profesional que aceptas puede desbloquear tu contacto con créditos de prueba.</p></article>
          <article data-reveal><MapPin size={24} /><h3>Cobertura nacional</h3><p>Indica región, comuna y modalidad de atención al publicar tu solicitud.</p></article>
          <article data-reveal><BriefcaseBusiness size={24} /><h3>Revisión profesional</h3><p>Los abogados deben pasar una aprobación antes de acceder al contacto de las personas.</p></article>
        </div>
      </section>

      <section className="join-section">
        <div className="section-shell join-layout" data-reveal>
          <div><Sparkles size={25} /><h2>¿Eres abogado o abogada?</h2><p>Crea un perfil profesional, define tus materias y recibe oportunidades relevantes.</p></div>
          <Link className="secondary-button" href="/registro?tipo=abogado">Crear perfil profesional <ArrowRight size={18} /></Link>
        </div>
      </section>

    </main>
  );
}
