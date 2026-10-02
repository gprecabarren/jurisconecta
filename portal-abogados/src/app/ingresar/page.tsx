"use client";

import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { FormEvent, useState } from "react";

export default function IngresarPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const result = await response.json() as { error?: string; destination?: string };
      if (!response.ok || !result.destination) throw new Error(result.error || "No pudimos iniciar sesión.");
      window.location.assign(result.destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos iniciar sesión.");
      setLoading(false);
    }
  }

  return <main className="auth-page"><Link className="auth-brand" href="/"><span><Scale size={20} /></span>JurisConecta</Link><section className="auth-card compact"><p className="eyebrow">Bienvenido de vuelta</p><h1>Ingresa a tu cuenta.</h1><p className="auth-intro">Tu panel se adapta a tu cuenta: persona o profesional. Puedes seguir tus casos y propuestas.</p><form className="auth-form" onSubmit={login}><label>Correo electrónico<input required type="email" name="email" autoComplete="email" placeholder="nombre@correo.cl" /></label><label>Contraseña<input required type="password" name="password" autoComplete="current-password" placeholder="Tu contraseña" /></label><button className="primary-button" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}<ArrowRight size={18} /></button></form>{message && <p className="form-message">{message}</p>}<p className="auth-switch"><Link href="/recuperar-clave">¿Olvidaste tu contraseña?</Link></p><p className="auth-switch">¿Aún no tienes cuenta? <Link href="/registro">Crea una aquí</Link></p></section></main>;
}
