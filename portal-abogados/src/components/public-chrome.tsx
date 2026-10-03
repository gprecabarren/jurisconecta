import Link from "next/link";
import { ArrowRight, Camera, MessageCircle, Music2, Play, Scale, Send } from "lucide-react";
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

export function SocialLinks({ links, placement }: { links: SocialLink[]; placement: "header" | "footer" }) {
  if (!links.length) return null;
  return <div className={`site-social-links site-social-links-${placement}`} aria-label="Redes oficiales de JurisConecta">
    {links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`JurisConecta en ${socialPlatformLabels[link.platform]}`} title={socialPlatformLabels[link.platform]}><SocialIcon platform={link.platform} /></a>)}
  </div>;
}

export function PublicHeader({ socialLinks = [], home = false }: { socialLinks?: SocialLink[]; home?: boolean }) {
  const anchor = (id: string) => home ? `#${id}` : `/#${id}`;
  return <header className="site-header public-site-header">
    <Link className="brand" href="/" aria-label="JurisConecta inicio"><span className="brand-mark"><Scale size={22} strokeWidth={2.6} /></span><span>Juris<span>Conecta</span></span></Link>
    <nav className="public-main-nav" aria-label="Navegación principal"><a href={anchor("como-funciona")}>Cómo funciona</a><a href={anchor("casos")}>Casos</a><a href={anchor("confianza")}>Por qué elegirnos</a><Link href="/soporte">Soporte</Link></nav>
    <div className="public-header-right"><SocialLinks links={socialLinks} placement="header" /><div className="header-actions"><Link className="client-login-link" href="/ingresar">Iniciar sesión</Link><Link className="lawyer-link" href="/registro">Registrarse <ArrowRight size={15} aria-hidden="true" /></Link></div></div>
  </header>;
}

export function PublicFooter({ socialLinks = [] }: { socialLinks?: SocialLink[] }) {
  return <footer className="site-footer section-shell">
    <div className="footer-brand"><Link className="brand" href="/"><span className="brand-mark"><Scale size={20} /></span><span>Juris<span>Conecta</span></span></Link><p>Conexiones legales claras para Chile.</p>{socialLinks.length > 0 && <div className="footer-social"><h3>Síguenos</h3><SocialLinks links={socialLinks} placement="footer" /></div>}</div>
    <div><h3>Personas</h3><Link href="/registro">Publicar un caso</Link><Link href="/ingresar">Iniciar sesión</Link><Link href="/cliente">Seguir mis casos</Link></div>
    <div><h3>Profesionales</h3><Link href="/registro?tipo=abogado">Crear perfil</Link><Link href="/ingresar">Ingresar</Link></div>
    <div><h3>Soporte</h3><Link href="/soporte">Ayuda y tickets</Link><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link></div>
  </footer>;
}
