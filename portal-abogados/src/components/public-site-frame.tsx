"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import type { SocialLink } from "../../shared/social-links";
import { PublicFooter, PublicHeader } from "./public-chrome";

const privateRoute = /^\/(?:admin|account|casos|dashboard|evaluaciones|planes|postulacion-abogado|cliente|publicar-caso|mantenimiento)(?:\/|$)/;

export function PublicSiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicPage = !privateRoute.test(pathname);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  useEffect(() => {
    if (!publicPage) return;
    let active = true;
    void fetch("/api/content").then(async (response) => response.ok ? await response.json() as { socialLinks?: SocialLink[]; contactEmail?: string } : null).then((data) => {
      if (active && Array.isArray(data?.socialLinks)) setSocialLinks(data.socialLinks);
      if (active && typeof data?.contactEmail === "string") setContactEmail(data.contactEmail);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [publicPage]);
  return <>{publicPage && <PublicHeader socialLinks={socialLinks} contactEmail={contactEmail} home={pathname === "/"} />}{children}{publicPage && <PublicFooter socialLinks={socialLinks} contactEmail={contactEmail} />}</>;
}
