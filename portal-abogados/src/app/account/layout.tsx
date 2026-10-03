import { privateMetadata } from "../../lib/seo";
export const metadata = { ...privateMetadata, title: "Mi cuenta profesional" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
