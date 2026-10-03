"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import type { SocialLink } from "../../shared/social-links";
import { PublicFooter, PublicHeader } from "./public-chrome";

const privateRoute = /^\/(?:admin|account|casos|dashboard|evaluaciones|planes|postulacion-abogado|cliente|publicar-caso)(?:\/|$)/;

export function PublicSiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicPage = !privateRoute.test(pathname);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  useEffect(() => {
    if (!publicPage) return;
    let active = true;
    void fetch("/api/content").then(async (response) => response.ok ? await response.json() as { socialLinks?: SocialLink[] } : null).then((data) => {
      if (active && Array.isArray(data?.socialLinks)) setSocialLinks(data.socialLinks);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [publicPage]);
  return <>{publicPage && <PublicHeader socialLinks={socialLinks} home={pathname === "/"} />}{children}{publicPage && <PublicFooter socialLinks={socialLinks} />}</>;
}
