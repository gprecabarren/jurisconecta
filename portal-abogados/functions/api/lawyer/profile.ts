import { cleanText, D1Database, requireUser, UserAuthEnv } from "../../_lib/user-auth";
import { isChileRegion } from "../../../shared/chile";
import { validAvatarDataUrl } from "../../_lib/avatar";
import { professionalLegalAreas } from "../../../shared/legal-catalog";
import { readJsonBody } from "../../_lib/http";

interface Context { request: Request; env: UserAuthEnv & { DB?: D1Database }; }
type LawyerProfile = { full_name: string; email: string; status: string; phone: string | null; region: string | null; commune: string | null; avatar_data_url: string | null; specialties_json: string; bio: string | null; plan_code: string; credit_balance: number; renewal_date: string | null; application_status: string; application_review_note: string | null; };
type Application = { rut: string | null; id_document_number: string | null; birth_date: string | null; graduation_date: string | null; university: string | null; attention_mode: string | null; service_localities: string | null; experience_years: number | null; gender: string | null; additional_studies: string | null; work_experience: string | null; linkedin_url: string | null; twitter_url: string | null; youtube_url: string | null; facebook_url: string | null; instagram_url: string | null; website_url: string | null; address: string | null; selected_plan_code: string | null; };

export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const [profile, application, documents] = await Promise.all([
    env.DB.prepare("SELECT u.full_name, u.email, u.status, u.phone, u.region, u.commune, u.avatar_data_url, lp.specialties_json, lp.bio, lp.plan_code, lp.credit_balance, lp.renewal_date, lp.application_status, lp.application_review_note FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ? LIMIT 1").bind(session.id).first<LawyerProfile>(),
    env.DB.prepare("SELECT rut, id_document_number, birth_date, graduation_date, university, attention_mode, service_localities, experience_years, gender, additional_studies, work_experience, linkedin_url, twitter_url, youtube_url, facebook_url, instagram_url, website_url, address, selected_plan_code FROM lawyer_applications WHERE user_id = ? LIMIT 1").bind(session.id).first<Application>(),
    env.DB.prepare("SELECT document_type, file_name FROM lawyer_application_documents WHERE user_id = ?").bind(session.id).all<{ document_type: string; file_name: string }>(),
  ]);
  if (!profile) return Response.json({ error: "No encontramos tu perfil." }, { status: 404 });
  return Response.json({ profile, application: application || {}, documents: documents.results });
};

type ProfileUpdate = { fullName?: unknown; phone?: unknown; region?: unknown; commune?: unknown; specialties?: unknown; bio?: unknown; avatarDataUrl?: unknown; };

export const onRequestPatch = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = await readJsonBody(request, 40_000) as ProfileUpdate | null;
  if (!payload) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  const fullName = cleanText(payload.fullName, 120);
  const specialties = Array.isArray(payload.specialties) ? payload.specialties.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 10) : [];
  if (fullName.length < 3) return Response.json({ error: "Ingresa tu nombre completo." }, { status: 400 });
  const region = cleanText(payload.region, 80);
  if (region && !isChileRegion(region)) return Response.json({ error: "Selecciona una region valida de Chile." }, { status: 400 });
  if (specialties.length === 0 || specialties.some((item) => !professionalLegalAreas.includes(item))) return Response.json({ error: "Selecciona al menos una especialidad válida." }, { status: 400 });
  if (payload.avatarDataUrl !== undefined && !validAvatarDataUrl(payload.avatarDataUrl)) return Response.json({ error: "La foto debe ser WebP, JPG o PNG de hasta 24 KB." }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET full_name = ?, phone = ?, region = ?, commune = ?, avatar_data_url = CASE WHEN ? = 1 THEN ? ELSE avatar_data_url END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(fullName, cleanText(payload.phone, 30) || null, region || null, cleanText(payload.commune, 80) || null, payload.avatarDataUrl === undefined ? 0 : 1, payload.avatarDataUrl === undefined ? null : payload.avatarDataUrl, session.id),
    env.DB.prepare("UPDATE lawyer_profiles SET specialties_json = ?, bio = ? WHERE user_id = ?").bind(JSON.stringify(specialties), cleanText(payload.bio, 3000) || null, session.id),
  ]);
  return Response.json({ saved: true });
};
