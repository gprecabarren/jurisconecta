"use client";
/* eslint-disable @next/next/no-img-element -- Images are small validated data URLs; no image CDN is used. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BriefcaseBusiness, CircleHelp, ContactRound, Eye, FileCheck2, LayoutDashboard, LogOut, Scale, Settings2, Star, UsersRound, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const lawyerItems = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/casos/preferentes", label: "Casos preferentes", icon: Star },
  { href: "/casos/pool", label: "Casos del pool", icon: UsersRound },
  { href: "/casos/accedidos", label: "Casos accedidos", icon: FileCheck2 },
  { href: "/casos/propuestas", label: "Mis propuestas", icon: ContactRound },
  { href: "/evaluaciones", label: "Evaluaciones", icon: BarChart3 },
  { href: "/account", label: "Mi cuenta", icon: Settings2 },
  { href: "/soporte", label: "Soporte y tickets", icon: CircleHelp },
  { href: "/planes", label: "Plan y créditos", icon: WalletCards },
];

type LawyerHeader = { full_name: string; plan_code: string; credit_balance: number; renewal_date: string | null; avatar_data_url: string | null };

export function PortalShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const pathname = usePathname();
  const [lawyer, setLawyer] = useState<LawyerHeader | null>(null);
  useEffect(() => {
    if (!admin) void fetch("/api/lawyer/profile").then(async (response) => response.ok ? await response.json() as { profile?: LawyerHeader } : null).then((result) => setLawyer(result?.profile || null)).catch(() => undefined);
  }, [admin]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }
  const items = admin
    ? [
        { href: "/admin", label: "Resumen", icon: LayoutDashboard },
        { href: "/admin#perfiles", label: "Perfiles", icon: ContactRound },
        { href: "/admin#usuarios", label: "Todas las cuentas", icon: UsersRound },
        { href: "/admin#postulaciones", label: "Postulaciones", icon: FileCheck2 },
        { href: "/admin#casos", label: "Casos y créditos", icon: WalletCards },
        { href: "/admin#equipo", label: "Equipo", icon: UsersRound },
        { href: "/admin#redes", label: "Redes sociales", icon: ContactRound },
        { href: "/admin#configuracion", label: "Configuración", icon: Settings2 },
        { href: "/admin#vista-previa", label: "Vista previa", icon: Eye },
        { href: "/admin#soporte", label: "Centro de ayuda", icon: CircleHelp },
        { href: "/admin#tickets", label: "Tickets", icon: CircleHelp },
        { href: "/admin#recuperacion", label: "Recuperación", icon: Settings2 },
        { href: "/admin#bitacora", label: "Bitácora", icon: FileCheck2 },
        { href: "/admin#sesiones", label: "Mis dispositivos", icon: Settings2 },
      ]
    : lawyerItems;
  const initials = (lawyer?.full_name || "PC").split(" ").map((item) => item[0]).join("").slice(0, 2);
  const renewal = lawyer?.renewal_date ? new Intl.DateTimeFormat("es-CL").format(new Date(`${lawyer.renewal_date}T12:00:00`)) : "por definir";

  return <div className="portal-shell">
    <aside className="portal-sidebar">
      <Link className="portal-logo" href="/"><span><Scale size={22} /></span>Juris<strong>Conecta</strong></Link>
      <p className="portal-caption">{admin ? "Administración" : "Área profesional"}</p>
      <nav className="portal-nav" aria-label="Navegación del portal">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : href === "/admin" ? pathname === "/admin" : pathname === href;
          return <Link className={active ? "portal-nav-item active" : "portal-nav-item"} key={href} href={href}><Icon size={18} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="portal-sidebar-bottom">
        <Link href="/soporte"><CircleHelp size={17} /> Ayuda y soporte</Link>
        <Link href="/"><BriefcaseBusiness size={17} /> Ver sitio público</Link>
        {!admin && <button className="portal-nav-item logout-button" onClick={logout}><LogOut size={17} /><span>Cerrar sesión</span></button>}
      </div>
    </aside>
    <section className="portal-workspace">
      <header className="portal-topbar">
        {!admin ? <div className="plan-summary"><span><b>{lawyer?.credit_balance ?? "-"}</b> créditos disponibles</span><span>Renovación: <b>{renewal}</b></span></div> : <div className="plan-summary"><span><b>JurisConecta</b> gestión interna</span><span>Modo demostración</span></div>}
        <div className="portal-user"><span className="topbar-notice">{admin ? "Administrador" : lawyer ? `Plan ${lawyer.plan_code}` : "Cuenta profesional"}</span>{!admin && lawyer?.avatar_data_url ? <img className="avatar" src={lawyer.avatar_data_url} alt="Foto de perfil" /> : <span className="avatar">{admin ? "AD" : initials}</span>}</div>
      </header>
      <main className="portal-main">{children}</main>
    </section>
  </div>;
}
