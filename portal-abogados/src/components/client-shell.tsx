"use client";

import Link from "next/link";
import { CircleHelp, FilePlus2, LayoutDashboard, LogOut, Menu, Settings2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { BrandLogo } from "./brand-logo";

type ClientUser = { full_name: string; email: string; region: string | null; commune: string | null; };

const items = [
  { href: "/cliente", label: "Resumen", icon: LayoutDashboard },
  { href: "/solicitar/", label: "Publicar un caso", icon: FilePlus2 },
  { href: "/soporte", label: "Soporte y tickets", icon: CircleHelp },
  { href: "/cliente/cuenta", label: "Mi cuenta", icon: Settings2 },
];

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { void fetch("/api/auth/me").then(async (response) => response.ok ? await response.json() as { user?: ClientUser } : null).then((result) => setUser(result?.user || null)).catch(() => undefined); }, []);
  const initials = (user?.full_name || "PC").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }
  return <div className="portal-shell client-shell">
    <aside className="portal-sidebar" onKeyDown={event => {if(event.key === "Escape"){setMenuOpen(false);document.getElementById("client-menu-toggle")?.focus();}}}>
      <Link className="portal-logo" href="/" aria-label="JurisConecta inicio"><BrandLogo decorative /></Link>
      <button id="client-menu-toggle" className="portal-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="client-navigation" onClick={()=>setMenuOpen(open=>!open)}>{menuOpen ? <X size={21}/> : <Menu size={21}/>}<span>{menuOpen ? "Cerrar" : "Menú"}</span></button>
      <p className="portal-caption">Área personal</p>
      <div id="client-navigation" className={`portal-navigation${menuOpen ? " is-open" : ""}`}>
        <nav className="portal-nav" aria-label="Navegación del cliente">{items.map(({href,label,icon:Icon})=><Link key={href} className={pathname.replace(/\/$/,"") === href.replace(/\/$/,"") ? "portal-nav-item active" : "portal-nav-item"} href={href} onClick={()=>setMenuOpen(false)}><Icon size={18}/><span>{label}</span></Link>)}</nav>
        <div className="portal-sidebar-bottom"><Link href="/soporte"><CircleHelp size={17}/> Ayuda y soporte</Link><button className="portal-nav-item logout-button" onClick={logout}><LogOut size={17}/><span>Cerrar sesión</span></button></div>
      </div>
    </aside>
    <section className="portal-workspace"><header className="portal-topbar"><div className="plan-summary"><span>Solicitudes <b>sin costo</b></span><span>Tu contacto se comparte solo tras aceptar una propuesta</span></div><div className="portal-user"><span className="topbar-notice">{user?.email || "Cargando cuenta"}</span><span className="avatar">{initials}</span></div></header><main className="portal-main">{children}</main></section>
  </div>;
}
