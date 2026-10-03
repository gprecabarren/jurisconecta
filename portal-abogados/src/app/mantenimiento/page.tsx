import Link from "next/link";
import { Scale, Wrench } from "lucide-react";

export default function MaintenancePage() {
  return <main className="maintenance-page"><div className="maintenance-card"><span className="brand-mark"><Scale size={27} /></span><p className="eyebrow">JurisConecta</p><Wrench size={31} aria-hidden="true" /><h1>Estamos preparando una mejor experiencia.</h1><p>El sitio se encuentra temporalmente en mantenimiento. Vuelve a visitarnos más tarde.</p><Link className="client-login-link" href="/auth/github/login">Acceso de administración</Link></div></main>;
}
