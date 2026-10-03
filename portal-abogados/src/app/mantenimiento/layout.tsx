import { privateMetadata } from "../../lib/seo";
export const metadata = { ...privateMetadata, title: "Sitio en mantenimiento" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
