/* eslint-disable @next/next/no-img-element -- First-party supplied SVGs need no image optimizer or external requests. */
import { BRAND, type BrandLogoVariant } from "../../shared/brand";

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  decorative?: boolean;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

/** Use decorative when a wrapping link already provides the accessible name. */
export function BrandLogo({ variant = "signature", decorative = false, className = "", loading = "eager", fetchPriority }: BrandLogoProps) {
  const asset = BRAND.logos[variant];
  return <img
    className={`brand-logo brand-logo--${variant}${className ? ` ${className}` : ""}`}
    src={asset.src}
    width={asset.width}
    height={asset.height}
    alt={decorative ? "" : BRAND.name}
    decoding="async"
    loading={loading}
    fetchPriority={fetchPriority}
  />;
}
