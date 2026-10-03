import { adminGitHubLogin, authSettings, readSession, type AuthEnv } from "../../_lib/github-auth";
import type { HelpArticle, TeamMember } from "../../_lib/content";
import type { D1Database } from "../../_lib/user-auth";
import { adminAuditStatement } from "../../_lib/admin-audit";
import { validateSocialLinks, type SocialLink } from "../../../shared/social-links";

interface Context { request: Request; env: AuthEnv & { DB?: D1Database }; }
type ContentPayload = { team: TeamMember[]; help: HelpArticle[]; socialLinks: SocialLink[] };

async function authenticated(request: Request, env: Context["env"]) {
  const session = await readSession(request, env);
  const { allowedLogin = adminGitHubLogin } = authSettings(env);
  return Boolean(session && session.login.toLowerCase() === allowedLogin.toLowerCase());
}

function validTeam(value: unknown): value is TeamMember[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.role === "string" && typeof item.bio === "string" && typeof item.initials === "string");
}

function validHelp(value: unknown): value is HelpArticle[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.category === "string" && typeof item.excerpt === "string");
}

export const onRequestGet = async ({ request, env }: Context) => {
  if (!await authenticated(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada" }, { status: 503 });
  const [team, help, socialLinks] = await Promise.all([
    env.DB.prepare("SELECT id, name, role, bio, initials FROM team_members ORDER BY sort_order, name").all<TeamMember>(),
    env.DB.prepare("SELECT id, title, category, excerpt FROM help_articles ORDER BY sort_order, title").all<HelpArticle>(),
    env.DB.prepare("SELECT id, platform, url FROM site_social_links ORDER BY sort_order, platform").all<SocialLink>(),
  ]);
  return Response.json({ team: team.results, help: help.results, socialLinks: socialLinks.results });
};

export const onRequestPut = async ({ request, env }: Context) => {
  if (!await authenticated(request, env)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada" }, { status: 503 });
  const db = env.DB;
  const payload = await request.json() as Partial<ContentPayload>;
  if (!validTeam(payload.team) || !validHelp(payload.help) || !validateSocialLinks(payload.socialLinks)) return Response.json({ error: "Contenido inválido; revisa las URL de las redes sociales." }, { status: 400 });
  const statements = [db.prepare("DELETE FROM team_members"), db.prepare("DELETE FROM help_articles"), db.prepare("DELETE FROM site_social_links")];
  payload.team.forEach((member, index) => statements.push(db.prepare("INSERT INTO team_members (id, name, role, bio, initials, sort_order) VALUES (?, ?, ?, ?, ?, ?)").bind(member.id, member.name.trim(), member.role.trim(), member.bio.trim(), member.initials.trim(), index)));
  payload.help.forEach((article, index) => statements.push(db.prepare("INSERT INTO help_articles (id, title, category, excerpt, sort_order) VALUES (?, ?, ?, ?, ?)").bind(article.id, article.title.trim(), article.category.trim(), article.excerpt.trim(), index)));
  payload.socialLinks.forEach((link, index) => statements.push(db.prepare("INSERT INTO site_social_links (id, platform, url, sort_order) VALUES (?, ?, ?, ?)").bind(link.id, link.platform, link.url, index)));
  statements.push(await adminAuditStatement(request, env, db, "content.publish", "site_content", null, { teamCount: payload.team.length, helpCount: payload.help.length, socialPlatforms: payload.socialLinks.map((link) => link.platform) }));
  await db.batch(statements);
  return Response.json({ saved: true });
};
