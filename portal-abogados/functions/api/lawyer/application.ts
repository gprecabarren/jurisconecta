import { cleanText, normalizeRut, requireUser, validRut, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { professionalLegalAreas } from "../../../shared/legal-catalog";

interface Context { request: Request; env: UserAuthEnv; }
const plans = new Set(["silver", "gold", "premium"]);
const modes = new Set(["remote", "hybrid", "in_person"]);

function optionalUrl(value: unknown) {
  const text = cleanText(value, 300);
  if (!text) return null;
  try { const url = new URL(text); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}

export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request);
  if (!body) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  const rut = normalizeRut(body.rut);
  const university = cleanText(body.university, 160);
  const graduationDate = cleanText(body.graduationDate, 10);
  const bio = cleanText(body.bio, 3000);
  const specialties = Array.isArray(body.specialties) ? body.specialties.filter((item): item is string => typeof item === "string" && professionalLegalAreas.includes(item)).slice(0, 10) : [];
  const plan = cleanText(body.planCode, 20);
  const mode = cleanText(body.attentionMode, 20);
  const years = Number(body.experienceYears ?? 0);
  if (!validRut(rut) || university.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(graduationDate) || Number.isNaN(Date.parse(graduationDate)) || graduationDate > new Date().toISOString().slice(0, 10) || bio.length < 30 || specialties.length === 0 || !plans.has(plan) || !modes.has(mode) || !Number.isInteger(years) || years < 0 || years > 70 || body.manualVerificationConsent !== true) return Response.json({ error: "Revisa RUT, título, fecha, especialidades, presentación y consentimiento para la revisión manual." }, { status: 400 });
  const links = [body.linkedinUrl, body.twitterUrl, body.youtubeUrl, body.facebookUrl, body.instagramUrl, body.websiteUrl];
  if (links.some((value) => cleanText(value, 300) && !optionalUrl(value))) return Response.json({ error: "Los enlaces profesionales deben comenzar con https:// o http://." }, { status: 400 });
  const profile = await env.DB.prepare("SELECT application_status FROM lawyer_profiles WHERE user_id = ? LIMIT 1").bind(session.id).first<{ application_status: string }>();
  if (!profile || !["draft", "changes_requested"].includes(profile.application_status)) return Response.json({ error: "Esta postulación no admite cambios en su estado actual." }, { status: 409 });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO lawyer_applications (user_id, rut, graduation_date, university, attention_mode, service_localities, experience_years, additional_studies, work_experience, linkedin_url, twitter_url, youtube_url, facebook_url, instagram_url, website_url, address, selected_plan_code, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET rut = excluded.rut, graduation_date = excluded.graduation_date, university = excluded.university, attention_mode = excluded.attention_mode, service_localities = excluded.service_localities, experience_years = excluded.experience_years, additional_studies = excluded.additional_studies, work_experience = excluded.work_experience, linkedin_url = excluded.linkedin_url, twitter_url = excluded.twitter_url, youtube_url = excluded.youtube_url, facebook_url = excluded.facebook_url, instagram_url = excluded.instagram_url, website_url = excluded.website_url, address = excluded.address, selected_plan_code = excluded.selected_plan_code, updated_at = CURRENT_TIMESTAMP").bind(session.id, rut, graduationDate, university, mode, cleanText(body.serviceLocalities, 600) || null, years, cleanText(body.additionalStudies, 3000) || null, cleanText(body.workExperience, 3000) || null, ...links.map(optionalUrl), cleanText(body.address, 500) || null, plan),
    env.DB.prepare("UPDATE lawyer_profiles SET specialties_json = ?, bio = ?, plan_code = ?, application_status = 'submitted', application_submitted_at = CURRENT_TIMESTAMP, application_review_note = NULL WHERE user_id = ?").bind(JSON.stringify(specialties), bio, plan, session.id),
    env.DB.prepare("UPDATE users SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.id),
  ]);
  return Response.json({ submitted: true, verification: "manual" }, { status: 201 });
};
