"use client";
import { FormEvent, useState } from "react";
export function AccountDangerZone() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(event: FormEvent<HTMLFormElement>, method: "PATCH" | "DELETE") {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (method === "DELETE" && form.get("confirmation") !== "ELIMINAR") { setNotice("Escribe ELIMINAR exactamente."); return; }
    const message = method === "DELETE" ? "Eliminará tu cuenta y los datos asociados de forma permanente. ¿Confirmas?" : "Deshabilitará tu cuenta y cerrará todas las sesiones. Para reactivarla necesitarás contactar a soporte. ¿Confirmas?";
    if (!window.confirm(message)) return;
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/auth/account", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password"), ...(method === "DELETE" ? { confirmation: form.get("confirmation") } : { action: "disable" }) }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No pudimos completar la acción."); window.location.assign("/"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Error de conexión."); } finally { setBusy(false); }
  }
  return <section className="portal-panel account-form danger-zone"><p className="eyebrow">Zona sensible</p><h2>Control de tu cuenta</h2><p>Deshabilitar bloquea el acceso hasta que soporte la reactive. Eliminar borra la cuenta y sus datos asociados de forma permanente; algunos registros mínimos de auditoría sin datos de identificación pueden conservarse.</p>{notice && <p role="status" className="save-confirmation">{notice}</p>}<div className="danger-actions"><form onSubmit={(event) => void action(event, "PATCH")}><label>Contraseña para deshabilitar<input name="password" type="password" required autoComplete="current-password" /></label><button className="portal-outline-button" disabled={busy}>Deshabilitar mi cuenta</button></form><form onSubmit={(event) => void action(event, "DELETE")}><label>Escribe ELIMINAR<input name="confirmation" required /></label><label>Confirma tu contraseña<input name="password" type="password" required autoComplete="current-password" /></label><button className="portal-danger-button" disabled={busy}>Eliminar mi cuenta</button></form></div></section>;
}
