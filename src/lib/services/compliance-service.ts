import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";

const OUTBOUND_WINDOW_MS = 60_000;
const OUTBOUND_MAX_PER_WINDOW = 20;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

export async function assertCustomerOptIn(businessId: string, customerId: string) {
  if (!ObjectId.isValid(businessId)) throw new Error("Invalid businessId");
  const db = await getDb();
  const customer = await db.collection("customers").findOne({
    businessId: new ObjectId(businessId),
    customerId,
  });
  if (!customer) throw new Error("Customer not found");

  const optIn = (customer as Record<string, unknown>).optIn;
  if (optIn === false) {
    throw new Error("Customer has not opted in for outbound messaging");
  }
}

export async function checkOutboundRateLimit(businessId: string) {
  if (!ObjectId.isValid(businessId)) throw new Error("Invalid businessId");
  const db = await getDb();
  const since = new Date(Date.now() - OUTBOUND_WINDOW_MS);
  const count = await db.collection("messages").countDocuments({
    businessId: new ObjectId(businessId),
    direction: "outgoing",
    createdAt: { $gte: since },
  });

  if (count >= OUTBOUND_MAX_PER_WINDOW) {
    throw new Error(`Outbound rate limit reached (${OUTBOUND_MAX_PER_WINDOW}/minute)`);
  }
}

export async function assertAntiSpamContent(input: {
  businessId: string;
  customerId: string;
  content: string;
}) {
  if (!ObjectId.isValid(input.businessId)) throw new Error("Invalid businessId");
  const db = await getDb();
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const duplicate = await db.collection("messages").findOne({
    businessId: new ObjectId(input.businessId),
    customerId: input.customerId,
    direction: "outgoing",
    text: input.content,
    createdAt: { $gte: since },
  });
  if (duplicate) {
    throw new Error("Duplicate outbound message blocked by anti-spam policy");
  }

  const quietHoursEnabled = process.env.COMPLIANCE_QUIET_HOURS_ENABLED === "true";
  if (quietHoursEnabled) {
    const hour = new Date().getHours();
    const start = Number(process.env.COMPLIANCE_QUIET_HOURS_START || 22);
    const end = Number(process.env.COMPLIANCE_QUIET_HOURS_END || 8);
    const inQuietWindow = start > end ? hour >= start || hour < end : hour >= start && hour < end;
    if (inQuietWindow) {
      throw new Error("Outbound blocked during compliance quiet hours");
    }
  }
}

export async function updateCustomerOptIn(input: {
  businessId: string;
  customerId: string;
  optIn: boolean;
}) {
  if (!ObjectId.isValid(input.businessId)) throw new Error("Invalid businessId");
  const db = await getDb();
  const result = await db.collection("customers").updateOne(
    { businessId: new ObjectId(input.businessId), customerId: input.customerId },
    {
      $set: {
        optIn: input.optIn,
        optInUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  if (!result.matchedCount) throw new Error("Customer not found");
  return { customerId: input.customerId, optIn: input.optIn };
}
