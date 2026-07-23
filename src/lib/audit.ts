import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import type { SessionUser } from "@/lib/backend/types";

function safeObjectId(value?: string | ObjectId | null) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export async function createAuditLog(input: {
  businessId?: string | ObjectId | null;
  actorUser?: Pick<SessionUser, "id" | "role"> | null;
  action: string;
  targetType: string;
  targetId?: string | ObjectId | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  const db = await getDb();
  await db.collection("audit_logs").insertOne({
    businessId: safeObjectId(input.businessId),
    actorUserId: safeObjectId(input.actorUser?.id),
    actorRole: input.actorUser?.role || "system",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ? input.targetId.toString() : null,
    metadata: input.metadata || {},
    ipAddress: input.ipAddress || null,
    createdAt: new Date(),
  });
}
