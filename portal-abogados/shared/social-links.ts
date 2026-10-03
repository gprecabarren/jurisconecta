export const socialPlatforms = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "whatsapp", "telegram"] as const;

export type SocialPlatform = (typeof socialPlatforms)[number];
export type SocialLink = { id: string; platform: SocialPlatform; url: string };

export const socialPlatformLabels: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

const allowedHosts: Record<SocialPlatform, readonly string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  whatsapp: ["wa.me", "api.whatsapp.com"],
  telegram: ["t.me", "www.t.me"],
};

export function validateSocialLinks(value: unknown): value is SocialLink[] {
  if (!Array.isArray(value) || value.length > socialPlatforms.length) return false;
  const used = new Set<string>();
  const usedIds = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const link = item as Partial<SocialLink>;
    if (typeof link.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(link.id) || usedIds.has(link.id)) return false;
    if (typeof link.platform !== "string" || !socialPlatforms.includes(link.platform as SocialPlatform) || used.has(link.platform)) return false;
    if (typeof link.url !== "string" || link.url.length > 300 || link.url.trim() !== link.url) return false;
    try {
      const url = new URL(link.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port || !allowedHosts[link.platform as SocialPlatform].includes(url.hostname.toLowerCase())) return false;
    } catch { return false; }
    used.add(link.platform);
    usedIds.add(link.id);
    return true;
  });
}
