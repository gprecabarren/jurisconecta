import { attentionModes, lawyerGenders, lawyerLinkFields, professionalColumns, validLawyerDate, validLawyerLink, validLawyerPhone, type LawyerApplicationData, type ProfessionalField } from "../../shared/lawyer-onboarding";
import { isChileRegion } from "../../shared/chile";
import { professionalLegalAreas } from "../../shared/legal-catalog";
import { validAvatarDataUrl } from "./avatar";
import { readCaseTypes } from "./case-types";
import type { D1Database, UserSession } from "./user-auth";

const detailLimits = {
  country: 80, university: 160, graduationDate: 10, birthDate: 10, gender: 20,
  attentionMode: 20, serviceLocalities: 600, additionalStudies: 3000, workExperience: 3000,
  linkedinUrl: 300, twitterUrl: 300, youtubeUrl: 300, facebookUrl: 300, instagramUrl: 300,
  websiteUrl: 300, address: 500, referralCode: 32,
} satisfies Record<ProfessionalField, number>;
const professionalFields = Object.keys(professionalColumns) as ProfessionalField[];
const applicationColumns = ["rut", "experience_years", "practice_topics_json", "selected_plan_code", ...Object.values(professionalColumns)] as const;
type ApplicationColumn = typeof applicationColumns[number];
type ApplicationChanges = Partial<Record<ApplicationColumn, string | number | null>>;
export const lawyerWriteLimit = 70_000;

export class LawyerDetailsError extends Error {}

export function readLawyerApplication(db: D1Database, id: string) {
  return db.prepare(`SELECT ${applicationColumns.join(", ")} FROM lawyer_applications WHERE user_id = ?`).bind(id).first<LawyerApplicationData>();
}

/** The column names are a fixed allowlist. All values, including IDs, are bound. */
export function writeLawyerApplication(db: D1Database, id: string, changes: ApplicationChanges, currentPlan: string) {
  const columns = applicationColumns.filter((column) => changes[column] !== undefined);
  const inserts = columns.includes("selected_plan_code") ? columns : [...columns, "selected_plan_code" as const];
  const assign = columns.map((column) => `${column} = excluded.${column}`);
  return db.prepare(`INSERT INTO lawyer_applications (user_id, ${inserts.join(", ")}) VALUES (?, ${inserts.map(() => "?").join(", ")})
    ON CONFLICT(user_id) DO UPDATE SET ${[...assign, "updated_at = CURRENT_TIMESTAMP"].join(", ")}`)
    .bind(id, ...inserts.map((column) => column === "selected_plan_code" ? changes[column] ?? currentPlan : changes[column]));
}

export function readLawyerContact(payload: Record<string, unknown>, current: { full_name: string; phone: string | null; region: string | null; commune: string | null }, country: string, required: boolean) {
  const fullName = payload.fullName === undefined ? current.full_name : optionalText(payload.fullName, 120, "Nombre completo");
  const phone = payload.phone === undefined ? current.phone : optionalText(payload.phone, 30, "Teléfono");
  const regionInput = payload.region === undefined ? current.region : optionalText(payload.region, 80, "Región");
  const region = country === "Chile" ? regionInput : null;
  const commune = payload.commune === undefined ? current.commune : optionalText(payload.commune, 80, "Localidad de residencia");
  if ((required || payload.fullName !== undefined) && (!fullName || fullName.length < 3)) throw new LawyerDetailsError("Ingresa tu nombre completo.");
  if (region && (required || region !== current.region) && !isChileRegion(region)) throw new LawyerDetailsError("Selecciona una región válida de Chile.");
  if ((required && !phone) || (phone && (required || phone !== current.phone) && !validLawyerPhone(phone))) throw new LawyerDetailsError("Ingresa un teléfono válido con código de país.");
  if (required && (!commune || (country === "Chile" && (!region || !isChileRegion(region))))) throw new LawyerDetailsError("Completa la región y comuna o la ciudad de residencia.");
  return { fullName, phone, region, commune };
}

export function readLawyerAvatar(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!validAvatarDataUrl(value)) throw new LawyerDetailsError("La foto debe ser WebP, JPG o PNG de hasta 24 KB.");
  return value;
}

function optionalText(value: unknown, length: number, label: string) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length > length || value.includes("\0")) throw new LawyerDetailsError(`Revisa el campo ${label}.`);
  return value.trim() || null;
}

export function readProfessionalDetails(payload: Record<string, unknown>, current: LawyerApplicationData, isRequired: boolean) {
  const changes: ApplicationChanges = {};
  const labels: Partial<Record<ProfessionalField, string>> = { graduationDate: "fecha de titulación", birthDate: "fecha de nacimiento", attentionMode: "tipo de atención", serviceLocalities: "localidades de atención", additionalStudies: "estudios adicionales", workExperience: "experiencia laboral", address: "dirección de oficina", referralCode: "código de referido" };
  for (const key of professionalFields) {
    if (payload[key] === undefined) continue;
    const column = professionalColumns[key];
    const value = optionalText(payload[key], detailLimits[key], labels[key] ?? key);
    changes[column] = key === "country" && value?.toLocaleLowerCase("es") === "chile" ? "Chile" : value;
  }
  const resolved = (column: ApplicationColumn) => changes[column] === undefined ? current[column] : changes[column];
  const countryValue = String(resolved("country") ?? "");
  if (changes.country !== undefined && countryValue.length < 2) throw new LawyerDetailsError("Indica el país de residencia.");
  const university = String(resolved("university") ?? "");
  if ((isRequired || changes.university) && university.length < 3) throw new LawyerDetailsError("Indica tu universidad.");
  const today = new Date().toISOString().slice(0, 10);
  const graduation = String(resolved("graduation_date") ?? "");
  const birth = String(resolved("birth_date") ?? "");
  if ((isRequired || changes.graduation_date) && !validLawyerDate(graduation, today)) throw new LawyerDetailsError("Indica una fecha de titulación válida.");
  if ((changes.birth_date !== undefined || changes.graduation_date !== undefined) && birth && (!validLawyerDate(birth, today) || (graduation && birth >= graduation))) throw new LawyerDetailsError("La fecha de nacimiento debe ser anterior a la titulación.");
  const mode = String(resolved("attention_mode") || "remote");
  if ((isRequired || changes.attention_mode !== undefined) && !Object.hasOwn(attentionModes, mode)) throw new LawyerDetailsError("Selecciona un tipo de atención válido.");
  if (mode !== "remote" && (changes.service_localities !== undefined || changes.attention_mode !== undefined) && !resolved("service_localities")) {
    if (isRequired || mode !== current.attention_mode || current.service_localities) throw new LawyerDetailsError("Indica tus localidades de atención.");
  }
  const gender = changes.gender;
  if (gender && gender !== current.gender && !Object.hasOwn(lawyerGenders, gender)) throw new LawyerDetailsError("Selecciona una opción de género válida.");
  for (const key of lawyerLinkFields) {
    const value = changes[professionalColumns[key]];
    if (typeof value === "string" && !validLawyerLink(value)) throw new LawyerDetailsError("Los enlaces profesionales deben usar HTTP o HTTPS y no incluir credenciales.");
  }
  if (changes.referral_code && !/^[a-z0-9_-]{1,32}$/i.test(String(changes.referral_code))) throw new LawyerDetailsError("El código de referido admite letras, números, guiones y guiones bajos.");
  if (payload.experienceYears !== undefined) {
    const years = typeof payload.experienceYears === "number" || (typeof payload.experienceYears === "string" && /^\d{0,2}$/.test(payload.experienceYears)) ? Number(payload.experienceYears) : NaN;
    if (!Number.isInteger(years) || years < 0 || years > 70) throw new LawyerDetailsError("Ingresa entre 0 y 70 años de experiencia.");
    changes.experience_years = years;
  }
  return { changes, country: countryValue || "Chile" };
}

export async function readLawyerPractice(db: D1Database, rawSpecialties: unknown, rawTopics: unknown, currentSpecialties: string, currentTopics: string) {
  if (rawSpecialties === undefined && rawTopics === undefined) return { specialties: undefined, topics: undefined };
  const catalog = await readCaseTypes(db);
  const topics = new Map(catalog.map(({ id, category }) => [id, category]));
  const allowed = new Set([...professionalLegalAreas, ...topics.values()]);
  const previous = readJsonStrings(currentSpecialties);
  const specialties = rawSpecialties === undefined ? previous : readSelectedStrings(rawSpecialties, 80);
  if (specialties.some((category) => !allowed.has(category) && !previous.includes(category))) throw new LawyerDetailsError("Selecciona áreas de práctica disponibles.");
  const selected = rawTopics === undefined ? readJsonStrings(currentTopics).filter((id) => specialties.includes(topics.get(id) ?? "")) : readSelectedStrings(rawTopics, 80);
  if (rawTopics !== undefined && selected.some((id) => !topics.has(id))) throw new LawyerDetailsError("Algún tipo de caso seleccionado ya no está disponible. Recarga la página.");
  const groups = [...new Set([...specialties, ...selected.flatMap((id) => topics.get(id) ?? [])])];
  const topicJson = JSON.stringify(selected);
  if (!groups.length) throw new LawyerDetailsError("Selecciona al menos un área de práctica.");
  if (topicJson.length > 10_000) throw new LawyerDetailsError("La selección de casos es demasiado grande.");
  return { specialties: JSON.stringify(groups), topics: topicJson };
}

function readSelectedStrings(value: unknown, length: number): string[] {
  if (!Array.isArray(value) || value.length > 240 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > length)) throw new LawyerDetailsError("Revisa los tipos de casos y las áreas seleccionadas.");
  return [...new Set(value)];
}

function readJsonStrings(value: string): string[] {
  try {
    const result: unknown = JSON.parse(value);
    return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

type GuardedWrite = { plan: string } | { application: LawyerApplicationData | null; specialties: string };

export function lawyerWriteGuard(db: D1Database, id: string, session: UserSession, write: GuardedWrite) {
  const baseSQL = `SELECT 1 FROM users u JOIN lawyer_profiles lp ON lp.user_id = u.id JOIN user_sessions s ON s.user_id = u.id
    WHERE u.id = ? AND u.session_version = ? AND s.id = ? AND s.revoked_at IS NULL
      AND ? > (julianday('now') - 2440587.5) * 86400000 AND u.role = 'lawyer' AND u.status <> 'suspended'`;
  const baseValues = [id, session.id, session.sessionVersion ?? 0, session.sessionId ?? "", session.expiresAt];
  if ("plan" in write) {
    return db.prepare(`INSERT INTO account_transaction_guards (id, valid) SELECT ?, CASE WHEN EXISTS (
      ${baseSQL} AND lp.application_status IN ('draft', 'changes_requested')
    ) AND EXISTS (SELECT 1 FROM subscription_plans WHERE code = ? AND active = 1) THEN 1 ELSE 0 END`).bind(...baseValues, write.plan);
  }
  // Compare the fields whose validation relies on another field in the current profile.
  const previous = write.application;
  return db.prepare(`INSERT INTO account_transaction_guards (id, valid) SELECT ?, CASE WHEN EXISTS (
    ${baseSQL} AND lp.application_status = 'approved' AND u.status = 'active' AND lp.specialties_json = ?
      AND COALESCE((SELECT json_array(la.country, la.birth_date, la.graduation_date, la.attention_mode, la.service_localities, la.practice_topics_json)
        FROM lawyer_applications la WHERE la.user_id = u.id), '[]') = CASE WHEN ? = 1 THEN json_array(?, ?, ?, ?, ?, ?) ELSE '[]' END
  ) THEN 1 ELSE 0 END`).bind(...baseValues, write.specialties, previous ? 1 : 0, previous?.country ?? null,
    previous?.birth_date ?? null, previous?.graduation_date ?? null, previous?.attention_mode ?? null, previous?.service_localities ?? null,
    previous?.practice_topics_json ?? null);
}

export function lawyerWriteConflict(error: unknown) {
  return error instanceof Error && /CHECK constraint failed:\s*valid\s*=\s*1/i.test(error.message);
}
