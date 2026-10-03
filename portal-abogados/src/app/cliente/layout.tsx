import { privateMetadata } from "../../lib/seo";
export const metadata = { ...privateMetadata, title: "Mis casos" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
