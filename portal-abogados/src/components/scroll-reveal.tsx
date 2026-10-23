"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { mountScrollReveal } from "@/lib/scroll-reveal-controller";

export function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    return mountScrollReveal(document, window);
  }, [pathname]);
  return null;
}
