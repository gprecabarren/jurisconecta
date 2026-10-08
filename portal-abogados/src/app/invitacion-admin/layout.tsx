import type { Metadata } from "next";
export const metadata: Metadata = { title: "Invitación de administrador", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
