import { publicMetadata } from "../../lib/seo";

export const metadata = publicMetadata("Noticias y guías legales en Chile", "Guías para encontrar abogados en Chile, preparar tu consulta y comparar propuestas legales con información clara y práctica.", "/noticias/");

// Cloudflare replaces this server-rendered shell with published D1 content.
// The Worker removes Next hydration scripts on these editorial pages.
export default function NewsShell() {
  return <main id="news-root" className="news-shell section-shell"><p className="eyebrow">Información que conecta</p><h1>Noticias y guías legales</h1><p>Orientación para tomar decisiones informadas antes de buscar apoyo legal.</p></main>;
}
