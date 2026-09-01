import { db } from "../db/index.js";
import { auditLog } from "../db/schema.js";

export async function auditEntry(params: {
  actorId: string;
  actorRole?: string;
  actionType: string;
  targetPatientId?: string;
  recordId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLog).values({
      actorId: params.actorId,
      actorRoleAtTime: params.actorRole,
      actionType: params.actionType,
      targetPatientId: params.targetPatientId,
      recordId: params.recordId,
      details: params.details,
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}
