"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ScrollReveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.02, rootMargin: '0px 0px 15% 0px' });
    elements.forEach((element) => {
      if (element.getBoundingClientRect().top < window.innerHeight * 1.15) {
        element.classList.add('reveal-visible');
      } else {
        element.classList.add('reveal-pending');
        observer.observe(element);
      }
    });
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove('reveal-pending'));
    };
  }, [pathname]);
  return null;
}
