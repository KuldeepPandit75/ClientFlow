import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { getCurrentUser } from "@/lib/services/auth-service";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { createAuditLog } from "@/lib/audit";
import { canManageAutomations } from "@/lib/permissions";
import type {
  AutomationDocument,
  AutomationDetail,
  AutomationListItem,
  AutomationStatus,
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  ConditionLogic,
  AutomationStats,
  AutomationMode,
} from "@/lib/automation/types";
import type { BusinessPlan } from "@/lib/backend/types";

function singleMainAutomationModeEnabled() {
  return process.env.SINGLE_MAIN_AUTOMATION_MODE !== "false";
}

async function enforceSingleMainAutomationRule(input: {
  db: Awaited<ReturnType<typeof getDb>>;
  businessId: string;
  accountKey: string;
  exceptAutomationId?: string;
}) {
  if (!singleMainAutomationModeEnabled()) return;
  const query: Record<string, unknown> = {
    businessId: new ObjectId(input.businessId),
    accountKey: input.accountKey,
    status: "active",
  };
  if (input.exceptAutomationId && ObjectId.isValid(input.exceptAutomationId)) {
    query._id = { $ne: new ObjectId(input.exceptAutomationId) };
  }
  const existingActive = await input.db.collection("automations").countDocuments(query);
  if (existingActive > 0) {
    throw new Error("Only one main active automation flow is allowed in this version.");
  }
}

async function getAutomationContext(userEmail: string) {
  const user = await getCurrentUser(userEmail);
  if (!user) throw new Error("Authentication required");
  if (user.status !== "active") throw new Error("Your account is not active");
  if (!canManageAutomations(user)) throw new Error("You do not have permission to manage automations");
  if (!user.businessId) throw new Error("Business workspace is missing");

  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) });
  if (!business) throw new Error("Business workspace was not found");
  if (business.status === "suspended") throw new Error("This business is suspended");
  if (business.status === "cancelled") throw new Error("This business is cancelled");

  return { user, business, businessId: user.businessId };
}

function serializeAutomation(doc: AutomationDocument): AutomationListItem {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    accountKey: doc.accountKey || "primary",
    mode: doc.mode || "rules",
    status: doc.status,
    triggerType: doc.trigger.type,
    conditionCount: doc.conditions.length,
    actionCount: doc.actions.length,
    stats: {
      totalRuns: doc.stats?.totalRuns || 0,
      successRuns: doc.stats?.successRuns || 0,
      failedRuns: doc.stats?.failedRuns || 0,
      skippedRuns: doc.stats?.skippedRuns || 0,
      lastRunAt: doc.stats?.lastRunAt || null,
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function serializeAutomationDetail(doc: AutomationDocument): AutomationDetail {
  return {
    ...serializeAutomation(doc),
    trigger: doc.trigger,
    conditions: doc.conditions,
    conditionLogic: doc.conditionLogic,
    actions: doc.actions,
    createdByUserId: doc.createdByUserId.toString(),
    businessId: doc.businessId.toString(),
  };
}

export async function listAutomations(userEmail: string): Promise<AutomationListItem[]> {
  const context = await getAutomationContext(userEmail);
  const db = await getDb();

  const automations = await db
    .collection<AutomationDocument>("automations")
    .find({ businessId: new ObjectId(context.businessId) })
    .sort({ createdAt: -1 })
    .toArray();

  return automations.map(serializeAutomation);
}

export async function getAutomation(userEmail: string, automationId: string): Promise<AutomationDetail | null> {
  const context = await getAutomationContext(userEmail);
  if (!ObjectId.isValid(automationId)) return null;

  const db = await getDb();
  const doc = await db.collection<AutomationDocument>("automations").findOne({
    _id: new ObjectId(automationId),
    businessId: new ObjectId(context.businessId),
  });

  return doc ? serializeAutomationDetail(doc) : null;
}

export async function createAutomation(
  userEmail: string,
  input: {
    name: string;
    description?: string;
    status?: AutomationStatus;
    accountKey?: string;
    mode?: AutomationMode;
    trigger: AutomationTrigger;
    conditions?: AutomationCondition[];
    conditionLogic?: ConditionLogic;
    actions: AutomationAction[];
  },
): Promise<AutomationDetail> {
  const context = await getAutomationContext(userEmail);
  const db = await getDb();

  const name = input.name?.trim();
  const accountKey = String(input.accountKey || "primary").trim().toLowerCase();
  const mode: AutomationMode = input.mode === "ai_agent" ? "ai_agent" : "rules";
  if (!name) throw new Error("Automation name is required");
  if (!input.trigger?.type) throw new Error("Trigger type is required");
  if (!input.actions?.length) throw new Error("At least one action is required");
  if (mode === "rules" && input.actions.some((action) => action.type === "send_ai_reply")) {
    throw new Error("AI reply actions require AI agent mode");
  }

  await db.collection("automations").createIndex(
    { businessId: 1, accountKey: 1 },
    {
      unique: true,
      partialFilterExpression: { status: "active" },
      name: "automations_one_active_per_account",
    },
  );

  // Check plan limits when activating
  const status = input.status || "draft";
  if (status === "active") {
    await enforceSingleMainAutomationRule({ db, businessId: context.businessId, accountKey });
    const plan = (context.business.plan || "free") as BusinessPlan;
    const limits = PLAN_LIMITS[plan];
    const activeCount = await db.collection("automations").countDocuments({
      businessId: new ObjectId(context.businessId),
      status: "active",
    });
    if (activeCount >= limits.maxAutomations) {
      throw new Error(
        `You have reached your automation limit (${limits.maxAutomations}). Upgrade your plan to activate more automations.`,
      );
    }
  }

  const now = new Date();
  const defaultStats: AutomationStats = {
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
    skippedRuns: 0,
    lastRunAt: null,
  };

  const doc: Omit<AutomationDocument, "_id"> = {
    businessId: new ObjectId(context.businessId),
    createdByUserId: new ObjectId(context.user.id),
    name,
    description: input.description?.trim() || "",
    accountKey,
    mode,
    status,
    trigger: {
      type: input.trigger.type,
      config: input.trigger.config || {},
    },
    conditions: (input.conditions || []).map((c, i) => ({
      ...c,
      id: c.id || `cond_${i + 1}`,
      config: c.config || {},
    })),
    conditionLogic: input.conditionLogic || "AND",
    actions: input.actions.map((a, i) => ({
      ...a,
      id: a.id || `action_${i + 1}`,
      order: a.order ?? i + 1,
      config: a.config || {},
    })),
    stats: defaultStats,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection("automations").insertOne(doc);

  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "automation.create",
    targetType: "automation",
    targetId: result.insertedId,
    metadata: { name, triggerType: input.trigger.type },
  });

  return serializeAutomationDetail({ ...doc, _id: result.insertedId } as AutomationDocument);
}

export async function updateAutomation(
  userEmail: string,
  automationId: string,
  input: {
    name?: string;
    description?: string;
    status?: AutomationStatus;
    accountKey?: string;
    mode?: AutomationMode;
    trigger?: AutomationTrigger;
    conditions?: AutomationCondition[];
    conditionLogic?: ConditionLogic;
    actions?: AutomationAction[];
  },
): Promise<AutomationDetail | null> {
  const context = await getAutomationContext(userEmail);
  if (!ObjectId.isValid(automationId)) return null;

  const db = await getDb();
  const existing = await db.collection<AutomationDocument>("automations").findOne({
    _id: new ObjectId(automationId),
    businessId: new ObjectId(context.businessId),
  });
  if (!existing) return null;

  const targetAccountKey = String(input.accountKey || existing.accountKey || "primary").trim().toLowerCase();
  const targetMode: AutomationMode = input.mode === undefined
    ? (existing.mode || "rules")
    : input.mode === "ai_agent" ? "ai_agent" : "rules";
  const targetActions = input.actions || existing.actions;
  if (targetMode === "rules" && targetActions.some((action) => action.type === "send_ai_reply")) {
    throw new Error("AI reply actions require AI agent mode");
  }

  // Check per-account exclusivity when activating or moving an active flow.
  if ((input.status === "active" || existing.status === "active") &&
      (existing.status !== "active" || targetAccountKey !== (existing.accountKey || "primary"))) {
    await enforceSingleMainAutomationRule({
      db,
      businessId: context.businessId,
      accountKey: targetAccountKey,
      exceptAutomationId: automationId,
    });
  }
  // Plan count only changes when an inactive flow is activated.
  if (input.status === "active" && existing.status !== "active") {
    const plan = (context.business.plan || "free") as BusinessPlan;
    const limits = PLAN_LIMITS[plan];
    const activeCount = await db.collection("automations").countDocuments({
      businessId: new ObjectId(context.businessId),
      status: "active",
    });
    if (activeCount >= limits.maxAutomations) {
      throw new Error(
        `You have reached your automation limit (${limits.maxAutomations}). Upgrade your plan to activate more automations.`,
      );
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.accountKey !== undefined) updates.accountKey = targetAccountKey;
  if (input.mode !== undefined) updates.mode = input.mode === "ai_agent" ? "ai_agent" : "rules";
  if (input.status !== undefined) updates.status = input.status;
  if (input.trigger !== undefined) updates.trigger = input.trigger;
  if (input.conditions !== undefined) {
    updates.conditions = input.conditions.map((c, i) => ({
      ...c,
      id: c.id || `cond_${i + 1}`,
      config: c.config || {},
    }));
  }
  if (input.conditionLogic !== undefined) updates.conditionLogic = input.conditionLogic;
  if (input.actions !== undefined) {
    updates.actions = input.actions.map((a, i) => ({
      ...a,
      id: a.id || `action_${i + 1}`,
      order: a.order ?? i + 1,
      config: a.config || {},
    }));
  }

  const result = await db.collection<AutomationDocument>("automations").findOneAndUpdate(
    { _id: new ObjectId(automationId), businessId: new ObjectId(context.businessId) },
    { $set: updates },
    { returnDocument: "after" },
  );

  if (result) {
    await createAuditLog({
      businessId: context.businessId,
      actorUser: context.user,
      action: "automation.update",
      targetType: "automation",
      targetId: automationId,
      metadata: { name: result.name },
    });
  }

  return result ? serializeAutomationDetail(result) : null;
}

export async function deleteAutomation(userEmail: string, automationId: string): Promise<boolean> {
  const context = await getAutomationContext(userEmail);
  if (!ObjectId.isValid(automationId)) return false;

  const db = await getDb();

  const result = await db.collection("automations").deleteOne({
    _id: new ObjectId(automationId),
    businessId: new ObjectId(context.businessId),
  });

  if (result.deletedCount > 0) {
    await createAuditLog({
      businessId: context.businessId,
      actorUser: context.user,
      action: "automation.delete",
      targetType: "automation",
      targetId: automationId,
    });
  }

  return result.deletedCount > 0;
}

export async function updateAutomationStatus(
  userEmail: string,
  automationId: string,
  status: AutomationStatus,
): Promise<AutomationDetail | null> {
  return updateAutomation(userEmail, automationId, { status });
}

export async function duplicateAutomation(
  userEmail: string,
  automationId: string,
): Promise<AutomationDetail | null> {
  const context = await getAutomationContext(userEmail);
  if (!ObjectId.isValid(automationId)) return null;

  const db = await getDb();
  const original = await db.collection<AutomationDocument>("automations").findOne({
    _id: new ObjectId(automationId),
    businessId: new ObjectId(context.businessId),
  });
  if (!original) return null;

  return createAutomation(userEmail, {
    name: `${original.name} (Copy)`,
    description: original.description,
    status: "draft",
    accountKey: original.accountKey || "primary",
    mode: original.mode || "rules",
    trigger: original.trigger,
    conditions: original.conditions,
    conditionLogic: original.conditionLogic,
    actions: original.actions,
  });
}

export async function createAutomationFromTemplate(
  userEmail: string,
  templateId: string,
  overrides?: { name?: string; description?: string },
): Promise<AutomationDetail | null> {
  if (!ObjectId.isValid(templateId)) return null;
  const db = await getDb();
  const template = await db.collection("automation_templates").findOne({
    _id: new ObjectId(templateId),
  });
  if (!template) return null;

  return createAutomation(userEmail, {
    name: overrides?.name || template.name,
    description: overrides?.description || template.description,
    status: "draft",
    accountKey: String(template.accountKey || "primary"),
    mode: template.mode === "ai_agent" || (template.actions || []).some((action: AutomationAction) => action.type === "send_ai_reply")
      ? "ai_agent"
      : "rules",
    trigger: template.trigger,
    conditions: template.conditions || [],
    conditionLogic: template.conditionLogic || "AND",
    actions: template.actions || [],
  });
}
