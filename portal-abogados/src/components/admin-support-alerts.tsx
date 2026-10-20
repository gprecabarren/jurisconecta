"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./admin-support-alerts.module.css";

/** A small private query, paused in background tabs; never fetch ticket bodies here. */
export function AdminSupportAlerts() {
  const [count, setCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let running = false;
    let authorized = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (active && authorized && document.visibilityState === "visible") {
        timer = setTimeout(() => { void refresh(); }, 90_000);
      }
    };
    async function refresh() {
      if (!active || running || !authorized || document.visibilityState !== "visible") return;
      running = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/admin/tickets?alertsOnly=1", { signal: controller.signal });
        if (response.status === 401) { authorized = false; return; }
        if (!response.ok) throw new Error("Alertas no disponibles");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || !("unreadAlerts" in value) || typeof value.unreadAlerts !== "number" || !Number.isSafeInteger(value.unreadAlerts) || value.unreadAlerts < 0) throw new Error("Respuesta inválida");
        if (active) { setCount(value.unreadAlerts); setUnavailable(false); }
      } catch {
        if (active && !controller.signal.aborted) setUnavailable(true);
      } finally {
        running = false;
        schedule();
      }
    }
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void refresh();
    };
    const updated = () => { void refresh(); };
    void refresh();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("juris:support-alerts-updated", updated);
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("juris:support-alerts-updated", updated);
    };
  }, []);

  const label = unavailable ? "Tickets: no se pudieron actualizar las alertas" : count === null ? "Ver tickets y alertas" : `${count} alertas de soporte sin revisar`;
  return <Link href="/admin/#tickets" className={styles.link} aria-label={label} title={label}><Bell size={18} aria-hidden="true" /><span className={styles.label}>Tickets</span>{count !== null && count > 0 ? <span className={styles.badge} aria-live="polite">{count > 99 ? "99+" : count}</span> : null}{unavailable ? <span className={styles.warning} aria-hidden="true">!</span> : null}</Link>;
}
