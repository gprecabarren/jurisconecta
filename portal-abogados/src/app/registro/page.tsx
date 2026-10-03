"use client";

import { Suspense } from "react";
import { RegistrationForm } from "../../components/registration-form";

export default function RegistroPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-card"><h1>Crea tu cuenta en JurisConecta</h1><p>Preparamos el registro para clientes y abogados.</p></section></main>}><RegistrationForm /></Suspense>;
}
