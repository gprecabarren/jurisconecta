import { privateMetadata } from "../../lib/seo";
export const metadata = { ...privateMetadata, title: "Planes de prueba" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
