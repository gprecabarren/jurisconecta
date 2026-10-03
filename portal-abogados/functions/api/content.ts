import { defaultHelp, defaultTeam, type HelpArticle, type TeamMember } from "../_lib/content";
import type { SocialLink } from "../../shared/social-links";

interface D1Statement { bind(...values: unknown[]): D1Statement; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null>; }
interface D1Database { prepare(query: string): D1Statement; }
interface Context { env: { DB?: D1Database }; }

export const onRequestGet = async ({ env }: Context) => {
  if (!env.DB) return Response.json({ team: defaultTeam, help: defaultHelp, socialLinks: [], contactEmail: "" });
  try {
    const [team, help, socialLinks, settings] = await Promise.all([
      env.DB.prepare("SELECT id, name, role, bio, initials FROM team_members ORDER BY sort_order, name").all<TeamMember>(),
      env.DB.prepare("SELECT id, title, category, excerpt FROM help_articles ORDER BY sort_order, title").all<HelpArticle>(),
      env.DB.prepare("SELECT id, platform, url FROM site_social_links ORDER BY sort_order, platform").all<SocialLink>(),
      env.DB.prepare("SELECT contact_email FROM site_settings WHERE id = 1").first<{ contact_email: string }>(),
    ]);
    return Response.json({ team: team.results, help: help.results, socialLinks: socialLinks.results, contactEmail: settings?.contact_email ?? "" });
  } catch { return Response.json({ team: defaultTeam, help: defaultHelp, socialLinks: [], contactEmail: "" }); }
};
