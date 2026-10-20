import Link from "next/link";
import { Wrench } from "lucide-react";
import { BrandLogo } from "../../components/brand-logo";

export default function MaintenancePage() {
  return <main className="maintenance-page"><div className="maintenance-card"><div className="maintenance-brand"><BrandLogo variant="vertical" /></div><Wrench size={31} aria-hidden="true" /><h1>Estamos preparando una mejor experiencia.</h1><p>El sitio se encuentra temporalmente en mantenimiento. Vuelve a visitarnos más tarde.</p><Link className="client-login-link" href="/auth/github/login">Acceso de administración</Link></div></main>;
}
