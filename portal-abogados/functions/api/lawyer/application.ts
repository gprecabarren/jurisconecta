import { cleanText, normalizeRut, requireUser, validRut, type UserAuthEnv } from "../../_lib/user-auth";
import { readJsonBody } from "../../_lib/http";
import { LawyerDetailsError, lawyerWriteConflict, lawyerWriteGuard, lawyerWriteLimit, readLawyerApplication, readLawyerAvatar, readLawyerContact, readLawyerPractice, readProfessionalDetails, writeLawyerApplication } from "../../_lib/lawyer-onboarding";

interface Context { request: Request; env: UserAuthEnv; }
type CurrentApplicant = { full_name: string; phone: string | null; region: string | null; commune: string | null; specialties_json: string; application_status: string };

export const onRequestPost = async ({ request, env }: Context) => {
  const db = env.DB;
  if (!db) return Response.json({ error: "Base de datos no disponible." }, { status: 503 });
  const session = await requireUser(request, env, "lawyer");
  if (!session) return Response.json({ error: "No autorizado." }, { status: 401 });
  const body = await readJsonBody(request, lawyerWriteLimit);
  if (!body) return Response.json({ error: "Solicitud inválida o demasiado grande." }, { status: 400 });
  const rut = normalizeRut(body.rut);
  const bio = cleanText(body.bio, 3000);
  const plan = cleanText(body.planCode, 20);
  if (!validRut(rut) || bio.length < 30 || !plan || body.manualVerificationConsent !== true) {
    return Response.json({ error: "Revisa el RUT, la presentación, el plan y el consentimiento para la revisión manual." }, { status: 400 });
  }
  const [profile, previous, availablePlan] = await Promise.all([
    db.prepare("SELECT u.full_name, u.phone, u.region, u.commune, lp.specialties_json, lp.application_status FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id WHERE u.id = ?").bind(session.id).first<CurrentApplicant>(),
    readLawyerApplication(db, session.id),
    db.prepare("SELECT code FROM subscription_plans WHERE code = ? AND active = 1").bind(plan).first<{ code: string }>(),
  ]);
  if (!profile || !["draft", "changes_requested"].includes(profile.application_status)) return Response.json({ error: "Esta postulación no admite cambios en su estado actual." }, { status: 409 });
  if (!availablePlan) return Response.json({ error: "Elige un plan habilitado." }, { status: 400 });
  try {
    const { changes, country } = readProfessionalDetails(body, previous ?? {}, true);
    const newContactForm = body.country !== undefined;
    const contact = readLawyerContact(body, profile, country, newContactForm);
    const avatar = readLawyerAvatar(body.avatarDataUrl);
    const practice = await readLawyerPractice(db, body.specialties ?? [], body.practiceTopicIds, profile.specialties_json, String(previous?.practice_topics_json || "[]"));
    const guard = crypto.randomUUID();
    await db.batch([
      lawyerWriteGuard(db, guard, session, { plan }),
      writeLawyerApplication(db, session.id, { ...changes, rut, ...(practice.topics === undefined ? {} : { practice_topics_json: practice.topics }), selected_plan_code: plan }, plan),
      db.prepare("UPDATE lawyer_profiles SET specialties_json = ?, bio = ?, plan_code = ?, application_status = 'submitted', application_submitted_at = CURRENT_TIMESTAMP, application_review_note = NULL WHERE user_id = ?").bind(practice.specialties ?? profile.specialties_json, bio, plan, session.id),
      db.prepare("UPDATE users SET full_name = ?, phone = ?, region = ?, commune = ?, avatar_data_url = CASE WHEN ? = 1 THEN ? ELSE avatar_data_url END, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(contact.fullName, contact.phone, contact.region, contact.commune, avatar === undefined ? 0 : 1, avatar ?? null, session.id),
      db.prepare("DELETE FROM account_transaction_guards WHERE id = ?").bind(guard),
    ]);
    return Response.json({ submitted: true, verification: "manual" }, { status: 201 });
  } catch (error) {
    if (error instanceof LawyerDetailsError) return Response.json({ error: error.message }, { status: 400 });
    if (lawyerWriteConflict(error)) return Response.json({ error: "La postulación, la sesión o el plan cambió. Recarga antes de continuar." }, { status: 409 });
    throw error;
  }
};
