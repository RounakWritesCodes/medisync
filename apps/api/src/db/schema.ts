import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, jsonb, integer, date, numeric, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  username: text("username").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("patient").notNull(),
  /**
   * Doctor credentialing status (D1): null for patients/admins; doctors carry
   * "pending_verification" | "verified" | "rejected". Doctor privileges
   * (access requests, emergency access) require "verified" — signup alone
   * never grants clinical authority.
   */
  verificationStatus: text("verification_status"),
  /** Incremented on password change/reset — session tokens embed this value and are rejected when stale. */
  tokenVersion: integer("token_version").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  username: text("username"),
  role: text("role").default("patient"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const diagnoses = pgTable("diagnoses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  patientName: text("patient_name").notNull(),
  age: integer("age").notNull(),
  gender: text("gender").notNull(),
  weight: numeric("weight"),
  height: numeric("height"),
  allergies: jsonb("allergies").default([]),
  currentMedications: jsonb("current_medications").default([]),
  symptoms: jsonb("symptoms").notNull().default([]),
  existingConditions: jsonb("existing_conditions").default([]),
  symptomDuration: text("symptom_duration"),
  severity: text("severity").notNull().default("mild"),
  aiResponse: jsonb("ai_response"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  date: date("date").notNull(),
  doctorName: text("doctor_name"),
  hospitalName: text("hospital_name"),
  details: jsonb("details").default({}),
  attachmentUrl: text("attachment_url"),
  contentType: text("content_type"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Doctor's stated clinical reason — required at creation. */
    reason: text("reason"),
    /** Scope the doctor asked for. */
    scope: jsonb("scope").default({}),
    /** Effective enforced scope, set at approval (approver may narrow). Read path checks this. */
    grantedScope: jsonb("granted_scope"),
    status: text("status").notNull().default("pending"),
    /**
     * Who holds consent authority for this request, evaluated live at decision
     * time (D4): "patient" (no active guardian), "guardian" (minor /
     * emergency_incapacity), or "dual" (advance_directive — both must approve).
     */
    consentModel: text("consent_model"),
    patientApprovedAt: timestamp("patient_approved_at", { withTimezone: true }),
    guardianApprovedAt: timestamp("guardian_approved_at", { withTimezone: true }),
    respondedBy: uuid("responded_by"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    /** Grant expiry (D2) — set on approval; null while pending/denied. Access dies when this passes. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Race-safe spam guard: one live request per doctor/patient pair.
    uniqueIndex("one_pending_request_per_pair")
      .on(table.doctorId, table.patientId)
      .where(sql`${table.status} = 'pending'`),
  ]
);

export const emergencyAccess = pgTable("emergency_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reasonCode: text("reason_code").notNull(),
  reasonText: text("reason_text").notNull(),
  status: text("status").notNull().default("active"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const guardianLinks = pgTable(
  "guardian_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull().default("pending_guardian"),
    /**
     * What the guardian may read once active (D6 — decided by the patient who
     * grants the link): "records" | "records_and_diagnoses".
     */
    scope: text("scope").notNull().default("records"),
    authorityDocumentRef: text("authority_document_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // At most ONE active guardianship per patient — avoids ambiguous consent authority.
    uniqueIndex("one_active_guardian_per_patient")
      .on(table.patientId)
      .where(sql`${table.status} = 'active_shared_control'`),
  ]
);

/**
 * Doctor credential verification (D1, India-aligned): registration details are
 * captured at signup and reviewed by an admin against the National Medical
 * Commission's Indian Medical Register / the relevant State Medical Council
 * register before any doctor privilege is granted.
 */
export const doctorVerifications = pgTable("doctor_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  /** Name exactly as printed on the council registration certificate. */
  fullName: text("full_name").notNull(),
  /** NMC / State Medical Council registration number (IMR format). */
  registrationNumber: text("registration_number").notNull(),
  /** Issuing authority: "nmc" or a state medical council code. */
  council: text("council").notNull(),
  /** Qualification(s) e.g. "MBBS", "MBBS, MD (General Medicine)". */
  qualification: text("qualification").notNull(),
  /** Year of first registration (optional, as shown in IMR). */
  yearOfRegistration: integer("year_of_registration"),
  /** Optional uploaded credential document (S3 object key). */
  idDocumentRef: text("id_document_ref"),
  status: text("status").notNull().default("pending_verification"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull(),
  actorRoleAtTime: text("actor_role_at_time"),
  actionType: text("action_type").notNull(),
  targetPatientId: uuid("target_patient_id"),
  recordId: uuid("record_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  details: jsonb("details"),
});

/**
 * Stores hashes of revoked session tokens.
 * When a user logs out, the token hash is inserted here.
 * verifySession() checks this table before accepting a token.
 */
export const revokedTokens = pgTable("revoked_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Stores email verification and password-reset tokens.
 * Tokens are single-use and expire after a configurable period.
 */
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  type: text("type").notNull(), // "email_verify" | "password_reset"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
