"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

const errors: Record<string, string> = {
  unavailable: "El acceso con Google aún no está disponible.", state: "No pudimos validar el acceso. Inícialo otra vez desde esta página.", expired: "El acceso expiró. Inténtalo de nuevo.",
  cancelled: "Cancelaste el acceso con Google. Puedes volver a intentarlo.", invalid: "No pudimos verificar tu identidad con Google. Inténtalo de nuevo.", session: "Vuelve a iniciar sesión para vincular tu cuenta.",
  existing: "Ese correo ya tiene una cuenta. Ingresa con contraseña y vincula Google desde tu panel, en Seguridad.", register: "Todavía no tienes una cuenta vinculada. Elige Crear cuenta y regístrate con Google.",
  disabled: "Esta cuenta no está disponible. Contacta a soporte.", link: "Usa la misma cuenta Google y el mismo correo de tu cuenta de JurisConecta.",
};
export function GoogleAccess({ intent = "login", role = "person", preview = false }: { intent?: "login" | "register"; role?: "person" | "lawyer"; preview?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (preview) return;
    let active = true;
    void fetch("/api/auth/providers").then((r) => r.json() as Promise<{ google?: boolean }>).then((data) => { if (active) setEnabled(data.google === true); }).catch(() => { if (active) setEnabled(false); });
    const reason = new URLSearchParams(window.location.search).get("google_error");
    if (reason) void Promise.resolve().then(() => { if (active) setError(errors[reason] || errors.invalid); });
    return () => { active = false; };
  }, [preview]);
  const icon = <Image src="/google-signin-icon.png" width={40} height={40} unoptimized alt="" aria-hidden="true" />;
  return <div className="google-access">{preview ? <button className="google-button" type="button" disabled>{icon}Continuar con Google (demostración)</button> : enabled ? <a className="google-button" href={`/auth/google/start?intent=${intent}&role=${role}`}>{icon}{intent === "register" ? "Crear cuenta con Google" : "Continuar con Google"}</a> : <p className="google-unavailable" role="status">{enabled === null ? "Comprobando acceso con Google…" : "Acceso con Google en preparación."}</p>}{error && <p role="alert" className="form-message">{error}</p>}<p className="auth-divider">o continúa con correo</p></div>;
}

export function GoogleAccountSecurity() {
  const [status, setStatus] = useState<{ enabled: boolean; linked: boolean; passwordAccount: boolean } | null>(null);
  useEffect(() => { void fetch("/api/auth/google/account").then((r) => r.ok ? r.json() as Promise<{ enabled: boolean; linked: boolean; passwordAccount: boolean }> : null).then(setStatus).catch(() => undefined); }, []);
  if (!status?.enabled) return null;
  return <section className="portal-panel google-security"><p className="eyebrow">Seguridad</p><h2>Tu acceso con Google</h2><p>{status.linked ? "Tu cuenta está vinculada a Google. Usa el mismo correo para ingresar." : "Puedes vincular tu cuenta Google con el mismo correo, manteniendo tu acceso actual y todos tus casos."}</p><a className="portal-outline-button" href={`/auth/google/start?intent=${status.linked ? "reauth" : "link"}`}>{status.linked ? "Verificar de nuevo con Google" : "Vincular mi cuenta Google"}</a>{status.linked && <p>Para deshabilitar o eliminar una cuenta creada con Google, verifica tu identidad aquí y completa la acción durante los próximos cinco minutos.</p>}</section>;
}
