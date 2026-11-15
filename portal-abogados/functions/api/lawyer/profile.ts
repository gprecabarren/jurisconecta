import { cleanText, requireUser, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { BillingError, ensureCurrentBilling, readBillingConfig, readBillingPlans } from "../../_lib/billing";
import { LawyerDetailsError, lawyerWriteConflict, lawyerWriteGuard, lawyerWriteLimit, readLawyerApplication, readLawyerAvatar, readLawyerContact, readLawyerPractice, readProfessionalDetails, writeLawyerApplication } from "../../_lib/lawyer-onboarding";

interface Context { request: Request; env: UserAuthEnv; }
type ProfileForEdit = { full_name: string; status: string; phone: string | null; region: string | null; commune: string | null; specialties_json: string; bio: string | null; plan_code: string; application_status: string };
type LawyerProfile = ProfileForEdit & { email: string; email_verified_at: string | null; avatar_data_url: string | null; credit_balance: number; renewal_date: string | null; application_review_note: string | null };

const getProfile = async ({ request, env }: Context) => {
  if (!env.DB) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const [profile, application, documents] = await Promise.all([
    env.DB.prepare("SELECT u.full_name, u.email, u.email_verified_at, u.status, u.phone, u.region, u.commune, u.avatar_data_url, lp.specialties_json, lp.bio, lp.plan_code, lp.credit_balance, lp.renewal_date, lp.application_status, lp.application_review_note FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ? LIMIT 1").bind(session.id).first<LawyerProfile>(),
    readLawyerApplication(env.DB, session.id),
    env.DB.prepare("SELECT document_type, file_name FROM lawyer_application_documents WHERE user_id = ?").bind(session.id).all<{ document_type: string; file_name: string }>(),
  ]);
  if (!profile) return Response.json({ error: "No encontramos tu perfil." }, { status: 404 });
  const billing = await ensureCurrentBilling(env.DB, session.id);
  const [config, plans] = await Promise.all([readBillingConfig(env.DB), readBillingPlans(env.DB, true)]);
  return Response.json({ profile: { ...profile, ...billing, billing_mode: config.mode, plan_monthly_credits: plans.find((plan) => plan.code === billing.plan_code)?.monthly_credits || 0 }, application: application || {}, documents: documents.results }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestGet = async (context: Context) => {
  try { return await getProfile(context); }
  catch (error) {
    if (error instanceof BillingError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
};

export const onRequestPatch = async ({ request, env }: Context) => {
  const db = env.DB;
  if (!db) return Response.json({ error: "La base de datos no está conectada." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  const payload = await readJsonBody(request, lawyerWriteLimit);
  if (!payload) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  const details = payload.professionalDetails ?? {};
  if (typeof details !== "object" || Array.isArray(details)) return Response.json({ error: "Los datos profesionales no son válidos." }, { status: 400 });
  const [profile, application] = await Promise.all([
    db.prepare("SELECT u.full_name, u.status, u.phone, u.region, u.commune, lp.specialties_json, lp.bio, lp.plan_code, lp.application_status FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ?").bind(session.id).first<ProfileForEdit>(),
    readLawyerApplication(db, session.id),
  ]);
  if (!profile || profile.application_status !== "approved" || profile.status !== "active") {
    return Response.json({ error: "Gestiona tus datos profesionales desde la postulación hasta que esté aprobada." }, { status: 409 });
  }
  try {
    const fields = details as Record<string, unknown>;
    const { changes, country } = readProfessionalDetails(fields, application ?? {}, false);
    const contact = readLawyerContact(payload, profile, country, false);
    const avatar = readLawyerAvatar(payload.avatarDataUrl);
    const practicesChanged = fields.practiceTopicIds !== undefined || (payload.specialties !== undefined && JSON.stringify(payload.specialties) !== profile.specialties_json);
    const practice = practicesChanged ? await readLawyerPractice(db, payload.specialties, fields.practiceTopicIds, profile.specialties_json, String(application?.practice_topics_json ?? "[]")) : { specialties: undefined, topics: undefined };
    if (practice.topics !== undefined) changes.practice_topics_json = practice.topics;
    const guard = crypto.randomUUID();
    await db.batch([
      lawyerWriteGuard(db, guard, session, { application, specialties: profile.specialties_json }),
      ...(Object.keys(changes).length ? [writeLawyerApplication(db, session.id, changes, profile.plan_code)] : []),
      db.prepare(`UPDATE users SET full_name = COALESCE(?, full_name), phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
        region = CASE WHEN ? = 1 THEN ? ELSE region END, commune = CASE WHEN ? = 1 THEN ? ELSE commune END,
        avatar_data_url = CASE WHEN ? = 1 THEN ? ELSE avatar_data_url END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(payload.fullName === undefined ? null : contact.fullName, payload.phone === undefined ? 0 : 1, contact.phone, payload.region === undefined && changes.country === undefined ? 0 : 1, contact.region, payload.commune === undefined ? 0 : 1, contact.commune, avatar === undefined ? 0 : 1, avatar ?? null, session.id),
      db.prepare("UPDATE lawyer_profiles SET specialties_json = COALESCE(?, specialties_json), bio = CASE WHEN ? = 1 THEN ? ELSE bio END WHERE user_id = ?")
        .bind(practice.specialties ?? null, payload.bio === undefined ? 0 : 1, cleanText(payload.bio, 3000) || null, session.id),
      db.prepare("DELETE FROM account_transaction_guards WHERE id = ?").bind(guard),
    ]);
    return Response.json({ saved: true });
  } catch (error) {
    if (error instanceof LawyerDetailsError) return Response.json({ error: error.message }, { status: 400 });
    if (lawyerWriteConflict(error)) return Response.json({ error: "La cuenta cambió durante la edición. Recarga antes de guardar." }, { status: 409 });
    throw error;
  }
};
