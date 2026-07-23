import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import type { SessionUser } from "@/lib/backend/types";
import { canManageTemplates } from "@/lib/permissions";
import { renderTemplate } from "@/lib/automation/templateRenderer";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { applyDottedTemplateValues } from "@/lib/templates/template-placeholders.mjs";

function requireAdmin(user: SessionUser): asserts user is SessionUser & { businessId: string } {
  if (!canManageTemplates(user) || !user.businessId) throw new Error("Forbidden");
}

export async function listMessageTemplates(user: SessionUser) {
  requireAdmin(user);
  const db = await getDb();
  const docs = await db.collection("message_templates")
    .find({ businessId: new ObjectId(user.businessId) })
    .sort({ updatedAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    name: String((doc as Record<string, unknown>).name || ""),
    category: String((doc as Record<string, unknown>).category || "general"),
    body: String((doc as Record<string, unknown>).body || ""),
    status: String((doc as Record<string, unknown>).status || "draft") === "approved"
      ? "ready"
      : String((doc as Record<string, unknown>).status || "draft"),
    variables: Array.isArray((doc as Record<string, unknown>).variables) ? (doc as Record<string, unknown>).variables : [],
    createdAt: (doc as Record<string, unknown>).createdAt,
    updatedAt: (doc as Record<string, unknown>).updatedAt,
  }));
}

export async function createMessageTemplate(user: SessionUser, input: {
  name: string;
  category: string;
  body: string;
  variables?: string[];
}) {
  requireAdmin(user);
  const name = String(input.name || "").trim();
  const body = String(input.body || "").trim();
  const category = String(input.category || "general").trim().toLowerCase();
  if (!name) throw new Error("name is required");
  if (!body) throw new Error("body is required");

  const variables = Array.isArray(input.variables)
    ? input.variables.map((v) => String(v).trim()).filter(Boolean)
    : Array.from(new Set((body.match(/\{\{([^}]+)\}\}/g) || []).map((m) => m.replace(/[{}]/g, "").trim())));

  const now = new Date();
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) });
  const plan = String((business as Record<string, unknown> | null)?.plan || "free") as keyof typeof PLAN_LIMITS;
  const templateLimit = PLAN_LIMITS[plan]?.maxTemplates || 10;
  const existingCount = await db.collection("message_templates").countDocuments({
    businessId: new ObjectId(user.businessId),
  });
  if (existingCount >= templateLimit) {
    throw new Error(`Template limit reached (${templateLimit}) for your current plan.`);
  }

  const doc = {
    businessId: new ObjectId(user.businessId),
    name,
    category,
    body,
    status: "draft",
    variables,
    createdByUserId: new ObjectId(user.id),
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection("message_templates").insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function updateMessageTemplateStatus(user: SessionUser, id: string, status: "draft" | "ready" | "disabled") {
  requireAdmin(user);
  if (!ObjectId.isValid(id)) throw new Error("Invalid template id");
  const db = await getDb();
  const result = await db.collection("message_templates").findOneAndUpdate(
    { _id: new ObjectId(id), businessId: new ObjectId(user.businessId) },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Template not found");
  return {
    id: result._id.toString(),
    status: String((result as Record<string, unknown>).status || status),
    updatedAt: (result as Record<string, unknown>).updatedAt,
  };
}

export async function deleteMessageTemplate(user: SessionUser, id: string) {
  requireAdmin(user);
  if (!ObjectId.isValid(id)) throw new Error("Invalid template id");
  const db = await getDb();
  const result = await db.collection("message_templates").deleteOne({
    _id: new ObjectId(id),
    businessId: new ObjectId(user.businessId),
  });
  if (!result.deletedCount) throw new Error("Template not found");
  return { deleted: true, id };
}

export function previewMessageTemplate(input: {
  body: string;
  values?: Record<string, string>;
  useExamples?: boolean;
}) {
  const values = input.values || {};
  const examples = input.useExamples !== false;
  const context: Record<string, unknown> = {
    customer: {
      name: values.customer_name || (examples ? "John" : ""),
      phone: values.customer_phone || (examples ? "+910000000000" : ""),
    },
    business: {
      name: values.business_name || (examples ? "Your Business" : ""),
    },
    agent: {
      name: values.agent_name || (examples ? "Support Agent" : ""),
    },
    lastMessage: {
      text: values.last_message || (examples ? "Hi" : ""),
    },
  };

  // Dotted keys let custom templates use any campaign-specific value, e.g.
  // appointment.date, invoice.number, payment.link or product.name.
  applyDottedTemplateValues(context, values);

  return renderTemplate(input.body || "", context as Parameters<typeof renderTemplate>[1]);
}
