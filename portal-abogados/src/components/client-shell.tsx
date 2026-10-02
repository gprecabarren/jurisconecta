"use client";

import Link from "next/link";
import { CircleHelp, FilePlus2, LayoutDashboard, LogOut, Scale, Settings2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type ClientUser = { full_name: string; email: string; region: string | null; commune: string | null; };

const items = [
  { href: "/cliente", label: "Resumen", icon: LayoutDashboard },
  { href: "/publicar-caso", label: "Publicar un caso", icon: FilePlus2 },
  { href: "/soporte", label: "Soporte y tickets", icon: CircleHelp },
  { href: "/cliente/cuenta", label: "Mi cuenta", icon: Settings2 },
];

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<ClientUser | null>(null);
  useEffect(() => { void fetch("/api/auth/me").then(async (response) => response.ok ? await response.json() as { user?: ClientUser } : null).then((result) => setUser(result?.user || null)).catch(() => undefined); }, []);
  const initials = (user?.full_name || "PC").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }
  return <div className="portal-shell client-shell"><aside className="portal-sidebar"><Link className="portal-logo" href="/"><span><Scale size={22} /></span>Juris<strong>Conecta</strong></Link><p className="portal-caption">Área personal</p><nav className="portal-nav" aria-label="Navegación del cliente">{items.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? "portal-nav-item active" : "portal-nav-item"} key={href} href={href}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="portal-sidebar-bottom"><Link href="/soporte"><CircleHelp size={17} /> Ayuda y soporte</Link><button className="portal-nav-item logout-button" onClick={logout}><LogOut size={17} /><span>Cerrar sesión</span></button></div></aside><section className="portal-workspace"><header className="portal-topbar"><div className="plan-summary"><span>Solicitudes <b>sin costo</b></span><span>Tu contacto se comparte solo tras aceptar una propuesta</span></div><div className="portal-user"><span className="topbar-notice">{user?.email || "Cargando cuenta"}</span><span className="avatar">{initials}</span></div></header><main className="portal-main">{children}</main></section></div>;
}
