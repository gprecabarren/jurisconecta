"use client";

import { useEffect, useState } from "react";

export function AdminSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/admin/settings").then(async (response) => {
      const data = await response.json() as { maintenanceEnabled?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la configuración.");
      setEnabled(data.maintenanceEnabled === true);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración.")).finally(() => setLoading(false));
  }, []);

  async function toggle() {
    const next = !enabled;
    if (next && !window.confirm("¿Activar mantenimiento? Todas las páginas y API públicas quedarán temporalmente inaccesibles. El panel de administración seguirá disponible.")) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maintenanceEnabled: next }) });
      const data = await response.json() as { maintenanceEnabled?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar el estado.");
      setEnabled(data.maintenanceEnabled === true);
      setMessage(next ? "Modo mantenimiento activado. El panel permanece accesible." : "Modo mantenimiento desactivado. El sitio vuelve a estar disponible.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado."); }
    finally { setSaving(false); }
  }

  return <section className="portal-panel admin-settings" id="configuracion"><div className="panel-title"><div><p className="eyebrow">Configuración del sitio</p><h2>Modo mantenimiento</h2></div><span className={enabled ? "state-chip" : "state-chip active"}>{loading ? "Cargando" : enabled ? "Activado" : "Desactivado"}</span></div><p>Al activarlo, los visitantes verán únicamente el aviso de mantenimiento y el acceso para iniciar sesión como administrador. Los cambios quedan registrados en la bitácora.</p><button type="button" className={enabled ? "portal-outline-button" : "portal-danger-button"} disabled={loading || saving} onClick={toggle}>{saving ? "Guardando..." : enabled ? "Desactivar mantenimiento" : "Activar mantenimiento"}</button>{message && <p role="status" className="save-confirmation">{message}</p>}</section>;
}
