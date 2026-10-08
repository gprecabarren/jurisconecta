"use client";
/* eslint-disable @next/next/no-img-element -- Images are small validated data URLs; no image CDN is used. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BriefcaseBusiness, CircleHelp, ContactRound, Eye, FileCheck2, LayoutDashboard, LogOut, Menu, Scale, Settings2, ShieldCheck, Star, UsersRound, WalletCards, X } from "lucide-react";
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
  const [administrator, setAdministrator] = useState<{ login: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");
  useEffect(() => {
    let active = true;
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    queueMicrotask(() => { if (active) updateHash(); });
    if (admin) void fetch("/api/admin/me").then(async (response) => response.ok ? await response.json() as { login: string; role: string } : null).then((value) => { if (active) setAdministrator(value); }).catch(() => undefined);
    return () => { active = false; window.removeEventListener("hashchange", updateHash); };
  }, [admin]);
  useEffect(() => {
    if (!admin) void fetch("/api/lawyer/profile").then(async (response) => response.ok ? await response.json() as { profile?: LawyerHeader } : null).then((result) => setLawyer(result?.profile || null)).catch(() => undefined);
  }, [admin]);
  async function logout() {
    const response = await fetch(admin ? "/api/admin/me" : "/api/auth/logout", { method: admin ? "DELETE" : "POST" });
    if (response.ok || response.status === 401) window.location.assign("/");
  }
  const items = admin
    ? [
        { href: "/admin", label: "Resumen", icon: LayoutDashboard },
        { href: "/admin#perfiles", label: "Perfiles", icon: ContactRound },
        { href: "/admin#usuarios", label: "Todas las cuentas", icon: UsersRound },
        { href: "/admin#administradores", label: "Administradores GitHub", icon: ShieldCheck },
        { href: "/admin#postulaciones", label: "Postulaciones", icon: FileCheck2 },
        { href: "/admin#casos", label: "Casos y créditos", icon: WalletCards },
        { href: "/admin#equipo", label: "Equipo", icon: UsersRound },
        { href: "/admin#redes", label: "Redes sociales", icon: ContactRound },
        { href: "/admin#configuracion", label: "Configuración", icon: Settings2 },
        { href: "/admin/noticias", label: "Noticias y SEO", icon: FileCheck2 },
        { href: "/admin#medicion", label: "Medición", icon: BarChart3 },
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
    <aside className="portal-sidebar" onKeyDown={(event) => { if (event.key === "Escape") { setMenuOpen(false); document.getElementById("portal-menu-toggle")?.focus(); } }}>
      <Link className="portal-logo" href="/"><span><Scale size={22} /></span>Juris<strong>Conecta</strong></Link>
      <button id="portal-menu-toggle" className="portal-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="portal-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}<span>{menuOpen ? "Cerrar" : "Menú"}</span></button>
      <p className="portal-caption">{admin ? "Administración" : "Área profesional"}</p>
      <div id="portal-navigation" className={`portal-navigation${menuOpen ? " is-open" : ""}`}>
      <nav className="portal-nav" aria-label="Navegación del portal">
        {items.map(({ href, label, icon: Icon }) => {
          const [base, section] = href.split("#");
          const active = pathname.replace(/\/$/, "") === base && (section ? hash === `#${section}` : !hash);
          return <Link aria-current={active ? section ? "location" : "page" : undefined} className={active ? "portal-nav-item active" : "portal-nav-item"} key={href} href={href} onClick={(event) => {
            setMenuOpen(false); setHash(section ? `#${section}` : "");
            if (section && pathname.replace(/\/$/, "") === base && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              window.history.pushState(null, "", `${pathname}#${section}`);
              // Scroll after the mobile drawer has collapsed, not while it shifts the target.
              requestAnimationFrame(() => requestAnimationFrame(() => {
                document.getElementById(section)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
              }));
            }
          }}><Icon size={18} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="portal-sidebar-bottom">
        <Link href="/soporte"><CircleHelp size={17} /> Ayuda y soporte</Link>
        <Link href="/"><BriefcaseBusiness size={17} /> Ver sitio público</Link>
        <button className="portal-nav-item logout-button" onClick={() => void logout()}><LogOut size={17} /><span>Cerrar sesión</span></button>
      </div>
      </div>
    </aside>
    <section className="portal-workspace">
      <header className="portal-topbar">
        {!admin ? <div className="plan-summary"><span><b>{lawyer?.credit_balance ?? "-"}</b> créditos disponibles</span><span>Renovación: <b>{renewal}</b></span></div> : <div className="plan-summary"><span><b>JurisConecta</b> gestión interna</span><span>Acceso protegido con GitHub</span></div>}
        <div className="portal-user"><span className="topbar-notice">{admin ? administrator ? `@${administrator.login}` : "Administrador" : lawyer ? `Plan ${lawyer.plan_code}` : "Cuenta profesional"}</span>{!admin && lawyer?.avatar_data_url ? <img className="avatar" src={lawyer.avatar_data_url} alt="Foto de perfil" /> : <span className="avatar">{admin ? "AD" : initials}</span>}</div>
      </header>
      <main className="portal-main">{children}</main>
    </section>
  </div>;
}
