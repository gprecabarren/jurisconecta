"use client";

import { Suspense } from "react";
import { RegistrationForm } from "../../components/registration-form";

export default function RegistroPage() {
  return <Suspense fallback={<main className="auth-page" />}><RegistrationForm /></Suspense>;
}
