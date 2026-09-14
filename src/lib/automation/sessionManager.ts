import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { sendEvolutionTextMessage } from "@/lib/evolution/client";
import type { AutomationAction, AutomationDocument } from "@/lib/automation/types";
import { enqueueJob } from "@/lib/services/job-service";

interface SessionConfig {
  enabled: boolean;
  nudgeAfterSeconds: number;
  closeAfterSeconds: number;
  nudgeMessage: string;
  closeMessage: string;
}

interface ScheduleInput {
  businessId: string;
  customerId: string;
  customerName: string;
  version: number;
  accountKey?: string;
}

interface SessionTimers {
  nudge?: ReturnType<typeof setTimeout>;
  close?: ReturnType<typeof setTimeout>;
}

const DEFAULT_NUDGE_MESSAGE = "Are you still there? I can help you with the next step whenever you are ready.";
const DEFAULT_CLOSE_MESSAGE = "I will pause this chat for now. Message me anytime and we can continue from here.";
const timers = new Map<string, SessionTimers>();

function sessionTrace(step: number, message: string, metadata?: Record<string, unknown>) {
  console.info(`[AutomationSession][step ${step}] ${message}`, metadata || "");
}

function asPositiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function actionSessionConfig(action: AutomationAction): SessionConfig | null {
  if (action.type !== "send_ai_reply") return null;
  const config = action.config || {};
  const enabled =
    config.sessionMode === true ||
    config.manageSession === true ||
    config.inactivityNudgeEnabled === true;

  if (!enabled) return null;

  return {
    enabled,
    nudgeAfterSeconds: asPositiveNumber(config.nudgeAfterSeconds, 120),
    closeAfterSeconds: asPositiveNumber(config.closeAfterSeconds, 30),
    nudgeMessage: String(config.nudgeMessage || DEFAULT_NUDGE_MESSAGE),
    closeMessage: String(config.closeMessage || DEFAULT_CLOSE_MESSAGE),
  };
}

async function getOwnerEmailForBusiness(db: Db, businessId: string): Promise<string | null> {
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(businessId) });
  if (!business?.ownerUserId) return null;
  const owner = await db.collection<{ email: string }>("users").findOne({ _id: business.ownerUserId });
  return owner?.email || null;
}

async function getSessionConfigForBusiness(db: Db, businessId: string, accountKey = "primary"): Promise<SessionConfig | null> {
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(businessId) });
  const defaults = (business as Record<string, unknown> | null)?.automationDefaults as Record<string, unknown> | undefined;
  const fallback = defaults?.sessionFollowUp as Record<string, unknown> | undefined;

  const automations = await db.collection<AutomationDocument>("automations")
    .find({
      businessId: new ObjectId(businessId),
      $or: [{ accountKey }, { accountKey: { $exists: false } }],
      status: "active",
      "trigger.type": "new_message_received",
      "actions.type": "send_ai_reply",
    })
    .toArray();

  for (const automation of automations) {
    for (const action of automation.actions) {
      const config = actionSessionConfig(action);
      if (config) {
        return {
          ...config,
          nudgeAfterSeconds: asPositiveNumber(fallback?.nudgeAfterSeconds, config.nudgeAfterSeconds),
          closeAfterSeconds: asPositiveNumber(fallback?.closeAfterSeconds, config.closeAfterSeconds),
          nudgeMessage: String(fallback?.nudgeMessage || config.nudgeMessage),
          closeMessage: String(fallback?.closeMessage || config.closeMessage),
        };
      }
    }
  }

  if (fallback) {
    return {
      enabled: true,
      nudgeAfterSeconds: asPositiveNumber(fallback.nudgeAfterSeconds, 120),
      closeAfterSeconds: asPositiveNumber(fallback.closeAfterSeconds, 30),
      nudgeMessage: String(fallback.nudgeMessage || DEFAULT_NUDGE_MESSAGE),
      closeMessage: String(fallback.closeMessage || DEFAULT_CLOSE_MESSAGE),
    };
  }

  return null;
}

function clearCustomerTimers(key: string) {
  const existing = timers.get(key);
  if (existing?.nudge) clearTimeout(existing.nudge);
  if (existing?.close) clearTimeout(existing.close);
  timers.delete(key);
}

async function sendSessionMessage(input: {
  db: Db;
  businessId: string;
  customerId: string;
  text: string;
  accountKey?: string;
  source: "automation_session_nudge" | "automation_session_close";
}) {
  const ownerEmail = await getOwnerEmailForBusiness(input.db, input.businessId);
  if (!ownerEmail) throw new Error("Business owner not found");

  await sendEvolutionTextMessage(input.customerId, input.text, {
    userEmail: ownerEmail,
    accountKey: input.accountKey || "primary",
  });

  const now = new Date();
  await input.db.collection("messages").insertOne({
    businessId: new ObjectId(input.businessId),
    accountKey: input.accountKey || "primary",
    customerId: input.customerId,
    messageId: `session_${input.source}_${input.customerId}_${Date.now()}`,
    direction: "outgoing",
    messageType: "text",
    text: input.text,
    senderType: "system",
    source: "automation",
    automationId: null,
    aiGenerated: false,
    sessionEvent: input.source,
    createdAt: now,
  });

  await input.db.collection("customers").updateOne(
    { businessId: new ObjectId(input.businessId), customerId: input.customerId, accountKey: input.accountKey || "primary" },
    {
      $set: {
        lastMessage: input.text,
        lastMessageAt: now.getTime(),
        lastOutgoingMessageAt: now,
        updatedAt: now,
      },
    },
  );
}

async function runNudge(input: ScheduleInput, config: SessionConfig) {
  const db = await getDb();
  const businessObjectId = new ObjectId(input.businessId);
  const customer = await db.collection("customers").findOne({
    businessId: businessObjectId,
    customerId: input.customerId,
    accountKey: input.accountKey || "primary",
  });
  const session = customer?.automationSession || {};

  if (
    session.status !== "active" ||
    session.version !== input.version ||
    session.nudgeSentForVersion === input.version ||
    session.closedForVersion === input.version
  ) {
    sessionTrace(3, "Skipped inactivity nudge; session moved on", {
      customerId: input.customerId,
      expectedVersion: input.version,
      actualVersion: session.version,
      status: session.status,
    });
    return;
  }

  await sendSessionMessage({
    db,
    businessId: input.businessId,
    customerId: input.customerId,
    text: config.nudgeMessage,
    source: "automation_session_nudge",
  });

  const now = new Date();
  await db.collection("customers").updateOne(
    { businessId: businessObjectId, customerId: input.customerId, accountKey: input.accountKey || "primary", "automationSession.version": input.version },
    {
      $set: {
        "automationSession.nudgeSentAt": now,
        "automationSession.nudgeSentForVersion": input.version,
        updatedAt: now,
      },
    },
  );

  sessionTrace(4, "Inactivity nudge sent", {
    customerId: input.customerId,
    version: input.version,
    closeAfterSeconds: config.closeAfterSeconds,
  });

  await enqueueJob({
    type: "session_close",
    businessId: input.businessId,
    runAt: new Date(Date.now() + config.closeAfterSeconds * 1000),
    payload: { ...input },
    dedupeKey: `session_close:${input.businessId}:${input.accountKey || "primary"}:${input.customerId}:${input.version}`,
  });
}

async function runClose(input: ScheduleInput, config: SessionConfig) {
  const db = await getDb();
  const businessObjectId = new ObjectId(input.businessId);
  const customer = await db.collection("customers").findOne({
    businessId: businessObjectId,
    customerId: input.customerId,
    accountKey: input.accountKey || "primary",
  });
  const session = customer?.automationSession || {};

  if (
    session.status !== "active" ||
    session.version !== input.version ||
    session.nudgeSentForVersion !== input.version ||
    session.closedForVersion === input.version
  ) {
    sessionTrace(5, "Skipped session close; session moved on", {
      customerId: input.customerId,
      expectedVersion: input.version,
      actualVersion: session.version,
      status: session.status,
    });
    return;
  }

  await sendSessionMessage({
    db,
    businessId: input.businessId,
    customerId: input.customerId,
    text: config.closeMessage,
    source: "automation_session_close",
  });

  const now = new Date();
  await db.collection("customers").updateOne(
    { businessId: businessObjectId, customerId: input.customerId, accountKey: input.accountKey || "primary", "automationSession.version": input.version },
    {
      $set: {
        status: "closed",
        "automationSession.status": "closed",
        "automationSession.closedAt": now,
        "automationSession.closedForVersion": input.version,
        updatedAt: now,
      },
    },
  );

  clearCustomerTimers(`${input.businessId}:${input.accountKey || "primary"}:${input.customerId}`);
  sessionTrace(6, "Inactive session closed", { customerId: input.customerId, version: input.version });
}

export async function scheduleSessionFollowUp(input: ScheduleInput) {
  const db = await getDb();
  const config = await getSessionConfigForBusiness(db, input.businessId, input.accountKey);
  const key = `${input.businessId}:${input.accountKey || "primary"}:${input.customerId}`;

  clearCustomerTimers(key);

  if (!config?.enabled) {
    sessionTrace(1, "No session follow-up automation configured", {
      customerId: input.customerId,
    });
    return;
  }

  const nudgeRunAt = new Date(Date.now() + config.nudgeAfterSeconds * 1000);
  await enqueueJob({
    type: "session_nudge",
    businessId: input.businessId,
    runAt: nudgeRunAt,
    payload: { ...input },
    dedupeKey: `session_nudge:${input.businessId}:${input.accountKey || "primary"}:${input.customerId}:${input.version}`,
  });

  // Keep short-lived in-memory timer as a best-effort fast path while DB job remains the durable source.
  const nudge = setTimeout(() => {
    void runNudge(input, config).catch((error) => {
      console.error("[AutomationSession] Nudge failed:", error instanceof Error ? error.message : error);
    });
  }, config.nudgeAfterSeconds * 1000);
  timers.set(key, { nudge });
  sessionTrace(2, "Session follow-up scheduled", {
    customerId: input.customerId,
    version: input.version,
    nudgeAfterSeconds: config.nudgeAfterSeconds,
    closeAfterSeconds: config.closeAfterSeconds,
  });
}

export async function processSessionJob(type: "session_nudge" | "session_close", payload: Record<string, unknown>) {
  const input: ScheduleInput = {
    businessId: String(payload.businessId || ""),
    customerId: String(payload.customerId || ""),
    customerName: String(payload.customerName || ""),
    version: Number(payload.version || 0),
    accountKey: String(payload.accountKey || "primary"),
  };
  if (!input.businessId || !input.customerId || !Number.isFinite(input.version) || input.version <= 0) {
    throw new Error("Invalid session job payload");
  }
  const db = await getDb();
  const config = await getSessionConfigForBusiness(db, input.businessId, input.accountKey);
  if (!config?.enabled) return;
  if (type === "session_nudge") {
    await runNudge(input, config);
  } else {
    await runClose(input, config);
  }
}
