import type { FastifyInstance } from "fastify";
import { eq, and, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { patientProfiles } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

/** Valid relationship values */
const VALID_RELATIONSHIPS = ["SELF", "CHILD", "PARENT", "SPOUSE", "OTHER"] as const;
const VALID_SEX = ["MALE", "FEMALE", "INTERSEX"] as const;

/**
 * Authorization middleware: ensures the logged-in user owns the requested profile.
 * Prevents IDOR vulnerabilities by verifying guardian_user_id matches the JWT user.
 */
async function verifyProfileAccess(request: any, reply: any) {
  const profileId = request.params?.id || request.body?.profile_id;
  if (!profileId) return; // No profile ID in request, skip check

  const uid = request.userId!;
  const [profile] = await db
    .select()
    .from(patientProfiles)
    .where(eq(patientProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    return reply.status(404).send({ error: "Profile not found" });
  }

  if (profile.guardianUserId !== uid) {
    return reply.status(403).send({ error: "Access denied: you do not own this profile" });
  }

  // Attach profile to request for downstream handlers
  (request as any).profile = profile;
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function profilesRoutes(app: FastifyInstance) {
  /**
   * GET /api/profiles
   * Retrieve all patient profiles belonging to the authenticated guardian.
   * Auto-creates a 'SELF' profile if the user has none.
   */
  app.get("/api/profiles", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;

    // Check if user has any profiles
    const existingProfiles = await db
      .select()
      .from(patientProfiles)
      .where(eq(patientProfiles.guardianUserId, uid));

    // Auto-create SELF profile if none exist
    if (existingProfiles.length === 0) {
      const [newProfile] = await db
        .insert(patientProfiles)
        .values({
          guardianUserId: uid,
          fullName: "Me",
          relationship: "SELF",
          dateOfBirth: "2000-01-01", // Placeholder - user should update
          biologicalSex: "MALE",
          isDefault: 1,
        })
        .returning();

      return reply.send({ profiles: [{ ...newProfile, age: calculateAge(newProfile.dateOfBirth) }] });
    }

    // Return profiles with calculated ages
    const profiles = existingProfiles.map((p) => ({
      ...p,
      age: calculateAge(p.dateOfBirth),
    }));

    return reply.send({ profiles });
  });

  /**
   * GET /api/profiles/:id
   * Get a specific profile by ID (with ownership check).
   */
  app.get(
    "/api/profiles/:id",
    { preHandler: [requireAuth, verifyProfileAccess] },
    async (request: any, reply) => {
      const profile = (request as any).profile;
      return reply.send({
        profile: { ...profile, age: calculateAge(profile.dateOfBirth) },
      });
    }
  );

  /**
   * POST /api/profiles
   * Create a new patient profile (dependent).
   */
  app.post("/api/profiles", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const body = request.body as any;

    // Validate required fields
    if (!body.fullName || typeof body.fullName !== "string" || body.fullName.trim().length === 0) {
      return reply.status(400).send({ error: "fullName is required" });
    }

    if (!body.dateOfBirth || typeof body.dateOfBirth !== "string") {
      return reply.status(400).send({ error: "dateOfBirth is required (YYYY-MM-DD)" });
    }

    // Validate date format
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(body.dateOfBirth)) {
      return reply.status(400).send({ error: "dateOfBirth must be in YYYY-MM-DD format" });
    }

    const dob = new Date(body.dateOfBirth);
    if (isNaN(dob.getTime())) {
      return reply.status(400).send({ error: "Invalid dateOfBirth" });
    }

    // Validate relationship
    const relationship = (body.relationship || "OTHER").toUpperCase();
    if (!VALID_RELATIONSHIPS.includes(relationship as any)) {
      return reply.status(400).send({ error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(", ")}` });
    }

    // Validate biological sex
    const biologicalSex = (body.biologicalSex || body.biological_sex || "MALE").toUpperCase();
    if (!VALID_SEX.includes(biologicalSex as any)) {
      return reply.status(400).send({ error: `biologicalSex must be one of: ${VALID_SEX.join(", ")}` });
    }

    // Check profile limit (max 10 profiles per user)
    const [profileCount] = await db
      .select({ count: count() })
      .from(patientProfiles)
      .where(eq(patientProfiles.guardianUserId, uid));

    if (profileCount.count >= 10) {
      return reply.status(400).send({ error: "Maximum 10 profiles per account" });
    }

    // Create profile
    const [newProfile] = await db
      .insert(patientProfiles)
      .values({
        guardianUserId: uid,
        fullName: body.fullName.trim(),
        relationship,
        dateOfBirth: body.dateOfBirth,
        biologicalSex,
        bloodGroup: body.bloodGroup || body.blood_group || null,
        allergies: body.allergies || [],
        avatarUrl: body.avatarUrl || body.avatar_url || null,
        isDefault: 0,
      })
      .returning();

    return reply.status(201).send({
      profile: { ...newProfile, age: calculateAge(newProfile.dateOfBirth) },
    });
  });

  /**
   * PATCH /api/profiles/:id
   * Update a patient profile.
   */
  app.patch(
    "/api/profiles/:id",
    { preHandler: [requireAuth, verifyProfileAccess] },
    async (request: any, reply) => {
      const profileId = request.params.id as string;
      const body = request.body as any;

      const updates: Record<string, any> = {};

      if (body.fullName !== undefined) updates.fullName = body.fullName.trim();
      if (body.relationship !== undefined) {
        const rel = body.relationship.toUpperCase();
        if (!VALID_RELATIONSHIPS.includes(rel)) {
          return reply.status(400).send({ error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(", ")}` });
        }
        updates.relationship = rel;
      }
      if (body.dateOfBirth !== undefined) updates.dateOfBirth = body.dateOfBirth;
      if (body.biologicalSex !== undefined || body.biological_sex !== undefined) {
        const sex = (body.biologicalSex || body.biological_sex).toUpperCase();
        if (!VALID_SEX.includes(sex)) {
          return reply.status(400).send({ error: `biologicalSex must be one of: ${VALID_SEX.join(", ")}` });
        }
        updates.biologicalSex = sex;
      }
      if (body.bloodGroup !== undefined || body.blood_group !== undefined) {
        updates.bloodGroup = body.bloodGroup || body.blood_group;
      }
      if (body.allergies !== undefined) updates.allergies = body.allergies;
      if (body.avatarUrl !== undefined || body.avatar_url !== undefined) {
        updates.avatarUrl = body.avatarUrl || body.avatar_url;
      }

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: "No valid fields to update" });
      }

      updates.updatedAt = new Date();

      const [updated] = await db
        .update(patientProfiles)
        .set(updates)
        .where(eq(patientProfiles.id, profileId))
        .returning();

      return reply.send({
        profile: { ...updated, age: calculateAge(updated.dateOfBirth) },
      });
    }
  );

  /**
   * PATCH /api/profiles/:id/set-default
   * Set a profile as the default (active) profile.
   */
  app.patch(
    "/api/profiles/:id/set-default",
    { preHandler: [requireAuth, verifyProfileAccess] },
    async (request: any, reply) => {
      const profileId = request.params.id as string;
      const uid = request.userId!;

      // Unset all defaults for this user
      await db
        .update(patientProfiles)
        .set({ isDefault: 0 })
        .where(eq(patientProfiles.guardianUserId, uid));

      // Set the new default
      const [updated] = await db
        .update(patientProfiles)
        .set({ isDefault: 1 })
        .where(eq(patientProfiles.id, profileId))
        .returning();

      return reply.send({
        profile: { ...updated, age: calculateAge(updated.dateOfBirth) },
      });
    }
  );

  /**
   * DELETE /api/profiles/:id
   * Delete a patient profile (cannot delete the SELF profile if it's the only one).
   */
  app.delete(
    "/api/profiles/:id",
    { preHandler: [requireAuth, verifyProfileAccess] },
    async (request: any, reply) => {
      const profileId = request.params.id as string;
      const profile = (request as any).profile;

      // Prevent deleting the only SELF profile
      if (profile.relationship === "SELF") {
        const [selfCount] = await db
          .select({ count: count() })
          .from(patientProfiles)
          .where(
            and(
              eq(patientProfiles.guardianUserId, request.userId!),
              eq(patientProfiles.relationship, "SELF")
            )
          );

        if (selfCount.count <= 1) {
          return reply.status(400).send({ error: "Cannot delete your only SELF profile" });
        }
      }

      await db.delete(patientProfiles).where(eq(patientProfiles.id, profileId));

      return reply.send({ ok: true });
    }
  );
}
