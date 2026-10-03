import Link from "next/link";
import { ArrowRight, Camera, Mail, MessageCircle, Music2, Play, Scale, Send } from "lucide-react";
import type { SocialLink, SocialPlatform } from "../../shared/social-links";
import { socialPlatformLabels } from "../../shared/social-links";

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case "instagram": return <Camera size={17} aria-hidden="true" />;
    case "facebook": return <span aria-hidden="true" className="social-letter">f</span>;
    case "linkedin": return <span aria-hidden="true" className="social-letter social-letter-in">in</span>;
    case "youtube": return <Play size={17} aria-hidden="true" />;
    case "tiktok": return <Music2 size={17} aria-hidden="true" />;
    case "whatsapp": return <MessageCircle size={17} aria-hidden="true" />;
    case "telegram": return <Send size={17} aria-hidden="true" />;
    case "x": return <span aria-hidden="true" className="social-letter">𝕏</span>;
  }
}

const primaryPlatforms = ["facebook", "instagram", "linkedin", "whatsapp"] as const;

export function SocialLinks({ links, contactEmail = "", placement }: { links: SocialLink[]; contactEmail?: string; placement: "header" | "footer" }) {
  const byPlatform = new Map(links.map((link) => [link.platform, link]));
  const extras = links.filter((link) => !primaryPlatforms.includes(link.platform as typeof primaryPlatforms[number]));
  return <div className={`site-social-links site-social-links-${placement}`} aria-label="Redes oficiales de JurisConecta">
    {primaryPlatforms.map((platform) => { const link = byPlatform.get(platform); return link
      ? <a key={platform} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`JurisConecta en ${socialPlatformLabels[platform]}`} title={socialPlatformLabels[platform]}><SocialIcon platform={platform} /></a>
      : <span key={platform} className="social-unconfigured" title={`${socialPlatformLabels[platform]}: enlace pendiente`} aria-label={`${socialPlatformLabels[platform]} aún no disponible`}><SocialIcon platform={platform} /></span>; })}
    {contactEmail ? <a href={`mailto:${contactEmail}`} aria-label={`Escribir a ${contactEmail}`} title="Correo electrónico"><Mail size={17} aria-hidden="true" /></a> : <span className="social-unconfigured" title="Correo electrónico: pendiente" aria-label="Correo electrónico aún no disponible"><Mail size={17} aria-hidden="true" /></span>}
    {extras.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`JurisConecta en ${socialPlatformLabels[link.platform]}`} title={socialPlatformLabels[link.platform]}><SocialIcon platform={link.platform} /></a>)}
  </div>;
}

export function PublicHeader({ socialLinks = [], contactEmail = "", home = false }: { socialLinks?: SocialLink[]; contactEmail?: string; home?: boolean }) {
  const anchor = (id: string) => home ? `#${id}` : `/#${id}`;
  return <header className="site-header public-site-header">
    <Link className="brand" href="/" aria-label="JurisConecta inicio"><span className="brand-mark"><Scale size={22} strokeWidth={2.6} /></span><span>Juris<span>Conecta</span></span></Link>
    <nav className="public-main-nav" aria-label="Navegación principal"><a href={anchor("como-funciona")}>Cómo funciona</a><a href={anchor("casos")}>Casos</a><a href={anchor("confianza")}>Por qué elegirnos</a><Link href="/soporte">Soporte</Link></nav>
    <div className="public-header-right"><SocialLinks links={socialLinks} contactEmail={contactEmail} placement="header" /><div className="header-actions"><Link className="client-login-link" href="/ingresar">Iniciar sesión</Link><Link className="lawyer-link" href="/registro">Registrarse <ArrowRight size={15} aria-hidden="true" /></Link></div></div>
  </header>;
}

export function PublicFooter({ socialLinks = [], contactEmail = "" }: { socialLinks?: SocialLink[]; contactEmail?: string }) {
  return <footer className="site-footer section-shell">
    <div className="footer-brand"><Link className="brand" href="/"><span className="brand-mark"><Scale size={20} /></span><span>Juris<span>Conecta</span></span></Link><p>Conexiones legales claras para Chile.</p><div className="footer-social"><h3>Redes y contacto</h3><SocialLinks links={socialLinks} contactEmail={contactEmail} placement="footer" /></div></div>
    <div><h3>Personas</h3><Link href="/registro">Publicar un caso</Link><Link href="/ingresar">Iniciar sesión</Link><Link href="/cliente">Seguir mis casos</Link></div>
    <div><h3>Profesionales</h3><Link href="/registro?tipo=abogado">Crear perfil</Link><Link href="/ingresar">Ingresar</Link></div>
    <div><h3>Soporte</h3><Link href="/soporte">Ayuda y tickets</Link><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link></div>
  </footer>;
}
