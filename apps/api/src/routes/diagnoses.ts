import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { diagnoses, guardianLinks, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { getActiveGuardianLink, grantedPatientIds } from "../lib/access.js";
import { auditEntry } from "../lib/audit.js";
import { config } from "../config.js";

/** Does one diagnosis satisfy the grant's date window? Categories don't apply. */
function diagnosisInDateScope(
  d: { createdAt: Date | null },
  scope: { dateFrom?: string; dateTo?: string }
): boolean {
  if (!scope.dateFrom && !scope.dateTo) return true;
  const day = (d.createdAt ?? new Date()).toISOString().slice(0, 10);
  if (scope.dateFrom && day < scope.dateFrom) return false;
  if (scope.dateTo && day > scope.dateTo) return false;
  return true;
}

const VALID_SEVERITIES = ["mild", "moderate", "severe"] as const;
const VALID_GENDERS = ["male", "female", "other"] as const;

/** Hard caps so a single request can't blow up the AI bill or the DB. */
const MAX_SYMPTOMS = 40;
const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 200;
const MAX_NAME_LENGTH = 120;
const MAX_DURATION_LENGTH = 100;

function asStringArray(value: unknown, field: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: `${field} must be an array of strings` };
  if (value.length > MAX_LIST_ITEMS) return { ok: false, error: `${field} must have at most ${MAX_LIST_ITEMS} items` };
  const cleaned = value.map((v) => String(v).trim().slice(0, MAX_ITEM_LENGTH)).filter((v) => v.length > 0);
  return { ok: true, value: cleaned };
}

interface DiagnosisInput {
  patientInfo: {
    name: string;
    age: number;
    gender: string;
    weight?: number | string | null;
    height?: number | string | null;
    allergies?: string[];
    currentMedications?: string[];
  };
  symptoms: string[];
  existingConditions: string[];
  symptomDuration: string;
  severity: string;
}

/**
 * Calls the local Python MediSync AI service — no external API keys needed.
 * The Python service runs deterministic symptom extraction, disease ranking,
 * safety screening, and clinical intelligence (from ayushabhinandan-rath-dev/medisync).
 */
async function callAI(input: DiagnosisInput): Promise<string> {
  if (config.aiMock) return JSON.stringify(generateMockResponse(input));

  const res = await fetch(`${config.aiBaseUrl}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: [
        input.symptoms.join(", "),
        input.symptomDuration ? `Duration: ${input.symptomDuration}` : "",
        input.patientInfo.allergies?.length ? `Allergies: ${input.patientInfo.allergies.join(", ")}` : "",
        input.patientInfo.currentMedications?.length ? `Medications: ${input.patientInfo.currentMedications.join(", ")}` : "",
        input.existingConditions?.length ? `History: ${input.existingConditions.join(", ")}` : "",
      ].filter(Boolean).join(". "),
      age: input.patientInfo.age,
      sex: input.patientInfo.gender,
      symptoms: input.symptoms,
      existing_conditions: input.existingConditions,
      allergies: input.patientInfo.allergies || [],
      current_medications: input.patientInfo.currentMedications || [],
      symptom_duration: input.symptomDuration,
      severity: input.severity,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI service returned ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  // Store the full structured response as JSON string
  return JSON.stringify(data);
}

interface MockStructuredResponse {
  clinical_summary: string;
  possible_conditions: Array<{ name: string; match_score: number; relevance_label: string; matched_symptoms: string[] }>;
  immediate_solutions: string[];
  recommended_tests: string[];
  when_to_seek_emergency: string[];
}

function generateMockResponse(input: DiagnosisInput): MockStructuredResponse {
  return {
    clinical_summary: `A ${input.severity} presentation with ${input.symptoms.join(", ")}. Duration: ${input.symptomDuration || "not specified"}.`,
    possible_conditions: [
      { name: "Common viral infection", match_score: 0.85, relevance_label: "strong", matched_symptoms: input.symptoms.slice(0, 3) },
      { name: "Stress-related condition", match_score: 0.45, relevance_label: "moderate", matched_symptoms: [] },
      { name: "Allergic reaction", match_score: 0.35, relevance_label: "weak", matched_symptoms: [] },
    ],
    immediate_solutions: [
      "Rest and stay hydrated",
      "Over-the-counter pain relief if needed",
      "Monitor symptoms for 24-48 hours",
      "Keep a symptom diary",
    ],
    recommended_tests: [
      "Complete Blood Count (CBC)",
      "Basic Metabolic Panel",
      "Consider allergy testing if symptoms persist",
    ],
    when_to_seek_emergency: [
      "Difficulty breathing or chest pain",
      "High fever (above 103°F/39.4°C) lasting more than 3 days",
      "Severe headache with stiff neck",
      "Any sudden worsening of symptoms",
    ],
  };
}

export async function diagnosesRoutes(app: FastifyInstance) {
  /**
   * Visibility: owner always; active guardians per link scope; doctors/admins
   * with a LIVE consent grant (expiry + date window re-checked every request).
   * Every delegated read is audited. Rows carry `owner` so the UI can hide
   * destructive actions on entries the viewer doesn't own.
   */
  app.get("/api/diagnoses", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const role = request.userRole!;

    const own = await db.select().from(diagnoses).where(eq(diagnoses.userId, uid));
    let combined: Array<(typeof diagnoses.$inferSelect) & { owner: boolean; patient_email?: string | null }> =
      own.map((d) => ({ ...d, owner: true }));

    // Guardian path (records_and_diagnoses links only).
    const links = await db
      .select()
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.guardianId, uid),
          eq(guardianLinks.status, "active_shared_control"),
          eq(guardianLinks.scope, "records_and_diagnoses")
        )
      );
    for (const link of links) {
      if (link.patientId === uid) continue;
      const rows = await db.select().from(diagnoses).where(eq(diagnoses.userId, link.patientId));
      combined.push(...rows.map((d) => ({ ...d, owner: false })));
      await auditEntry({
        actorId: uid,
        actorRole: role,
        actionType: "diagnosis.list_viewed_by_guardian",
        targetPatientId: link.patientId,
        details: { count: rows.length, guardianLinkId: link.id },
      });
    }

    // Doctor/admin path: live consent grants.
    if (role === "doctor" || role === "admin") {
      const grants = await grantedPatientIds(uid);
      for (const [pid, scope] of grants) {
        if (pid === uid) continue;
        const rows = await db.select().from(diagnoses).where(eq(diagnoses.userId, pid));
        const visible = rows.filter((d) => diagnosisInDateScope(d, scope));
        const [patient] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, pid))
          .limit(1);
        combined.push(
          ...visible.map((d) => ({ ...d, owner: false, patient_email: patient?.email ?? null }))
        );
        await auditEntry({
          actorId: uid,
          actorRole: role,
          actionType: "diagnosis.list_viewed_by_doctor",
          targetPatientId: pid,
          details: { count: visible.length },
        });
      }
    }

    return reply.send({ diagnoses: combined });
  });

  app.get("/api/diagnoses/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [d] = await db.select().from(diagnoses).where(eq(diagnoses.id, id)).limit(1);
    if (!d) return reply.status(404).send({ error: "Diagnosis not found" });

    const uid = request.userId!;
    if (d.userId !== uid) {
      // Guardian with diagnoses scope?
      const link = await getActiveGuardianLink(uid, d.userId);
      if (link && link.scope === "records_and_diagnoses") {
        await auditEntry({
          actorId: uid,
          actorRole: request.userRole,
          actionType: "diagnosis.viewed_by_guardian",
          targetPatientId: d.userId,
          recordId: d.id,
          details: { guardianLinkId: link.id },
        });
        return reply.send({ diagnosis: { ...d, owner: false } });
      }
      // Doctor/admin with a LIVE grant covering this entry's date?
      if (request.userRole === "doctor" || request.userRole === "admin") {
        const grant = await grantedPatientIds(uid).then((m) => m.get(d.userId));
        if (!grant || !diagnosisInDateScope(d, grant)) {
          return reply.status(403).send({ error: "Access denied" });
        }
        await auditEntry({
          actorId: uid,
          actorRole: request.userRole,
          actionType: "diagnosis.viewed_by_delegate",
          targetPatientId: d.userId,
          recordId: d.id,
          details: { grantedScope: grant },
        });
        return reply.send({ diagnosis: { ...d, owner: false } });
      }
      return reply.status(403).send({ error: "Access denied" });
    }
    return reply.send({ diagnosis: { ...d, owner: true } });
  });

  app.post(
    "/api/diagnoses",
    {
      preHandler: [requireAuth],
      // AI calls cost real money — cap per-user/IP abuse.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
    const input = request.body as any;

    // --- Normalization + validation (previously unbounded/unvalidated) ---
    const name = typeof input?.patientInfo?.name === "string" ? input.patientInfo.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return reply.status(400).send({ error: `patientInfo.name is required (max ${MAX_NAME_LENGTH} chars)` });
    }

    const age = Number(input?.patientInfo?.age);
    if (!Number.isFinite(age) || age < 0 || age > 130) {
      return reply.status(400).send({ error: "patientInfo.age must be a number between 0 and 130" });
    }

    const gender = input?.patientInfo?.gender;
    if (!VALID_GENDERS.includes(gender)) {
      return reply.status(400).send({ error: "patientInfo.gender must be one of: male, female, other" });
    }

    const severity = input?.severity ?? "mild";
    if (!VALID_SEVERITIES.includes(severity)) {
      return reply.status(400).send({ error: "severity must be one of: mild, moderate, severe" });
    }

    const symptomsResult = asStringArray(input?.symptoms, "symptoms");
    if (!symptomsResult.ok) return reply.status(400).send({ error: symptomsResult.error });
    if (symptomsResult.value.length === 0) {
      return reply.status(400).send({ error: "At least one symptom is required" });
    }

    const conditionsResult = asStringArray(input?.existingConditions ?? input?.existing_conditions, "existingConditions");
    if (!conditionsResult.ok) return reply.status(400).send({ error: conditionsResult.error });

    const allergiesResult = asStringArray(input?.patientInfo?.allergies, "allergies");
    if (!allergiesResult.ok) return reply.status(400).send({ error: allergiesResult.error });

    const medsResult = asStringArray(input?.patientInfo?.currentMedications, "currentMedications");
    if (!medsResult.ok) return reply.status(400).send({ error: medsResult.error });

    const symptomDuration = String(input?.symptomDuration ?? input?.symptom_duration ?? "").slice(0, MAX_DURATION_LENGTH);

    const normalizedInput: DiagnosisInput = {
      patientInfo: {
        name,
        age,
        gender,
        weight: input.patientInfo.weight ?? null,
        height: input.patientInfo.height ?? null,
        allergies: allergiesResult.value,
        currentMedications: medsResult.value,
      },
      symptoms: symptomsResult.value,
      existingConditions: conditionsResult.value,
      symptomDuration,
      severity,
    };

    let aiResponse: string;
    try {
      aiResponse = await callAI(normalizedInput);
    } catch (err) {
      console.error("AI diagnosis generation failed:", err);
      // Generic message in production; include the underlying reason in dev so
      // misconfiguration (missing key, bad model, provider outage) is actionable.
      const detail = config.nodeEnv === "production" ? "" : ` (${err instanceof Error ? err.message : "unknown error"})`;
      return reply.status(502).send({ error: `AI diagnosis service is unavailable. Please try again later.${detail}` });
    }

    const [d] = await db
      .insert(diagnoses)
      .values({
        userId: request.userId!,
        patientName: normalizedInput.patientInfo.name,
        age: Math.round(age),
        gender: normalizedInput.patientInfo.gender,
        // drizzle numeric columns are string-typed; coerce safely
        weight: normalizedInput.patientInfo.weight != null ? String(normalizedInput.patientInfo.weight) : null,
        height: normalizedInput.patientInfo.height != null ? String(normalizedInput.patientInfo.height) : null,
        allergies: normalizedInput.patientInfo.allergies || [],
        currentMedications: normalizedInput.patientInfo.currentMedications || [],
        symptoms: normalizedInput.symptoms,
        existingConditions: normalizedInput.existingConditions,
        symptomDuration: normalizedInput.symptomDuration,
        severity: normalizedInput.severity,
        aiResponse,
      })
      .returning();
    return reply.status(201).send({ diagnosis: d });
  });

  app.delete("/api/diagnoses/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [d] = await db.select({ userId: diagnoses.userId }).from(diagnoses).where(eq(diagnoses.id, id)).limit(1);
    if (!d) return reply.status(404).send({ error: "Diagnosis not found" });
    if (d.userId !== request.userId) {
      return reply.status(403).send({ error: "Access denied" });
    }
    await db.delete(diagnoses).where(eq(diagnoses.id, id));
    return reply.send({ ok: true });
  });

  /**
   * Speech-to-text proxy: receives audio from the browser, forwards to the
   * Python AI service for Whisper transcription, and returns the text +
   * extracted symptoms.
   */
  app.post(
    "/api/speech-to-text",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        // Fastify raw body for multipart form data
        const parts = request.parts();
        let audioBuffer: Buffer | null = null;
        let contentType = "";

        for await (const part of parts) {
          if (part.type === "file" && part.fieldname === "audio") {
            contentType = part.mimetype;
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            audioBuffer = Buffer.concat(chunks);
          }
        }

        if (!audioBuffer) {
          return reply.status(400).send({ error: "No audio file provided" });
        }

        // Forward to Python AI service
        const boundary = `----MediSyncBoundary${Date.now()}`;
        const formDataParts: string[] = [];

        // Build multipart form data
        formDataParts.push(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="audio"; filename="recording.webm"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`
        );
        formDataParts.push(`\r\n--${boundary}--\r\n`);

        const header = Buffer.from(formDataParts[0]);
        const footer = Buffer.from(formDataParts[1]);
        const body = Buffer.concat([header, audioBuffer, footer]);

        const aiRes = await fetch(`${config.aiBaseUrl}/api/speech-to-text`, {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body,
          signal: AbortSignal.timeout(60_000),
        });

        if (!aiRes.ok) {
          const detail = await aiRes.text().catch(() => "");
          throw new Error(`AI service returned ${aiRes.status}: ${detail.slice(0, 300)}`);
        }

        const result = await aiRes.json();
        return reply.send(result);
      } catch (err) {
        console.error("Speech-to-text failed:", err);
        const detail = config.nodeEnv === "production" ? "" : ` (${err instanceof Error ? err.message : "unknown"})`;
        return reply.status(502).send({ error: `Speech recognition unavailable.${detail}` });
      }
    }
  );
}
