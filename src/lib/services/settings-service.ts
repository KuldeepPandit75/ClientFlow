import type { WhatsAppSettings } from "@/lib/backend/types";
import { createAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db/mongodb";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { canConnectWhatsapp } from "@/lib/permissions";
import { encryptSensitive, getEncryptionKeyVersion } from "@/lib/security/encryption";
import { getCurrentUser } from "@/lib/services/auth-service";
import {
  connectEvolutionInstance,
  disconnectEvolutionInstance,
  getEvolutionConfig,
  getEvolutionStatus,
  isEvolutionConfigured,
  type EvolutionConnectionResult,
} from "@/lib/evolution/client";
import { ObjectId } from "mongodb";

function normalizeAccountKey(value?: string | null) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "primary";
}

function resolveMaxWhatsappAccounts(business: Record<string, unknown>) {
  const businessLimits = (business.limits as Record<string, unknown> | undefined);
  const configuredLimit = Number(businessLimits?.maxWhatsappAccounts);
  if (Number.isFinite(configuredLimit) && configuredLimit > 0) return configuredLimit;
  const plan = String(business.plan || "free") as keyof typeof PLAN_LIMITS;
  return PLAN_LIMITS[plan]?.maxWhatsappAccounts || 1;
}

function resultToWhatsAppSettings(result: EvolutionConnectionResult): WhatsAppSettings {
  return {
    provider: "evolution",
    connected: result.connected,
    businessNumber: result.businessNumber,
    webhookUrl: result.webhookUrl,
    cloudinaryEnabled: false,
    evolution: {
      configured: result.configured,
      instanceName: result.instanceName,
      baseUrl: result.baseUrl,
      state: result.state,
      qrCode: result.qrCode,
      rawQrCode: result.rawQrCode,
      pairingCode: result.pairingCode,
      qrCount: result.qrCount,
      lastCheckedAt: result.lastCheckedAt,
      message: result.message,
    },
  };
}

export async function getWhatsAppSettings(userEmail: string): Promise<WhatsAppSettings> {
  const context = await getWhatsappContext(userEmail);
  const config = getEvolutionConfig({ userEmail: context.ownerEmail, accountKey: "primary" });

  return {
    provider: "evolution",
    connected: false,
    businessNumber: "",
    webhookUrl: config.webhookUrl,
    cloudinaryEnabled: false,
    evolution: {
      configured: isEvolutionConfigured(config),
      instanceName: config.instanceName,
      baseUrl: config.baseUrl,
      state: "unknown",
      qrCode: null,
      rawQrCode: null,
      pairingCode: null,
      qrCount: null,
      lastCheckedAt: null,
      message: null,
    },
  };
}

async function getWhatsappContext(userEmail: string, requireConnectionPermission = true) {
  const user = await getCurrentUser(userEmail);
  if (!user) throw new Error("Authentication required");
  if (requireConnectionPermission && !canConnectWhatsapp(user)) throw new Error("Forbidden");
  if (!user.businessId) throw new Error("Business workspace is missing");
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) });
  if (!business) throw new Error("Business workspace was not found");
  if (business.status === "suspended") throw new Error("This business is suspended");
  if (business.status === "cancelled") throw new Error("This business is cancelled");
  const owner = await db.collection("users").findOne<{ email: string }>({ _id: business.ownerUserId });
  return { user, business, businessId: user.businessId, ownerEmail: owner?.email || user.email };
}

async function syncWhatsappSession(
  userEmail: string,
  accountKey: string,
  result: ReturnType<typeof resultToWhatsAppSettings>,
) {
  const context = await getWhatsappContext(userEmail);
  const db = await getDb();
  const now = new Date();
  await db.collection("whatsapp_sessions").updateOne(
    {
      businessId: new ObjectId(context.businessId),
      accountKey,
      instanceName: result.evolution?.instanceName,
    },
    {
      $set: {
        businessId: new ObjectId(context.businessId),
        accountKey,
        instanceName: result.evolution?.instanceName,
        instanceNameEncrypted: encryptSensitive(result.evolution?.instanceName || ""),
        evolutionInstanceId: result.evolution?.instanceName,
        phoneNumber: result.businessNumber,
        phoneNumberEncrypted: encryptSensitive(result.businessNumber),
        encryptionKeyVersion: getEncryptionKeyVersion(),
        status: result.connected ? "connected" : result.evolution?.state || "disconnected",
        lastConnectedAt: result.connected ? now : null,
        lastSyncAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return { context, result };
}

export async function listWhatsAppAccounts(userEmail: string) {
  // Account metadata is safe for workspace members to read. Connecting,
  // disconnecting and refreshing still require an administrator.
  const context = await getWhatsappContext(userEmail, false);
  const db = await getDb();
  const sessions = await db.collection("whatsapp_sessions")
    .find({ businessId: new ObjectId(context.businessId) })
    .sort({ createdAt: 1 })
    .toArray();

  const maxAccounts = resolveMaxWhatsappAccounts(context.business as unknown as Record<string, unknown>);

  return {
    maxAccounts,
    usedAccounts: sessions.length,
    accounts: sessions.map((session) => ({
      id: session._id?.toString(),
      accountKey: String((session as Record<string, unknown>).accountKey || "primary"),
      instanceName: String((session as Record<string, unknown>).instanceName || ""),
      phoneNumber: String((session as Record<string, unknown>).phoneNumber || ""),
      status: String((session as Record<string, unknown>).status || "unknown"),
      lastConnectedAt: (session as Record<string, unknown>).lastConnectedAt || null,
      lastSyncAt: (session as Record<string, unknown>).lastSyncAt || null,
      createdAt: (session as Record<string, unknown>).createdAt || null,
      updatedAt: (session as Record<string, unknown>).updatedAt || null,
    })),
  };
}

export async function connectWhatsApp(userEmail: string, accountKeyInput?: string | null) {
  const context = await getWhatsappContext(userEmail);
  const accountKey = normalizeAccountKey(accountKeyInput);
  const db = await getDb();
  const businessObjectId = new ObjectId(context.businessId);
  const existing = await db.collection("whatsapp_sessions").findOne({
    businessId: businessObjectId,
    accountKey,
  });
  const maxAccounts = resolveMaxWhatsappAccounts(context.business as unknown as Record<string, unknown>);
  if (!existing) {
    const totalAccounts = await db.collection("whatsapp_sessions").countDocuments({ businessId: businessObjectId });
    if (totalAccounts >= maxAccounts) {
      throw new Error(`You can connect up to ${maxAccounts} WhatsApp account(s) on your current plan.`);
    }
  }

  const result = resultToWhatsAppSettings(
    await connectEvolutionInstance({ userEmail: context.ownerEmail, accountKey }),
  );
  await syncWhatsappSession(userEmail, accountKey, result);
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "whatsapp.connect",
    targetType: "whatsapp_session",
    targetId: result.evolution?.instanceName,
    metadata: { state: result.evolution?.state, accountKey },
  });
  return result;
}

export async function disconnectWhatsApp(userEmail: string, accountKeyInput?: string | null) {
  const context = await getWhatsappContext(userEmail);
  const accountKey = normalizeAccountKey(accountKeyInput);
  const result = resultToWhatsAppSettings(
    await disconnectEvolutionInstance({ userEmail: context.ownerEmail, accountKey }),
  );
  await syncWhatsappSession(userEmail, accountKey, result);
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "whatsapp.disconnect",
    targetType: "whatsapp_session",
    targetId: result.evolution?.instanceName,
    metadata: { accountKey },
  });
  return result;
}

export async function refreshEvolutionWhatsApp(userEmail: string, accountKeyInput?: string | null) {
  const context = await getWhatsappContext(userEmail);
  const accountKey = normalizeAccountKey(accountKeyInput);
  const result = resultToWhatsAppSettings(
    await getEvolutionStatus({ userEmail: context.ownerEmail, accountKey }),
  );
  await syncWhatsappSession(userEmail, accountKey, result);
  return result;
}

export async function testWhatsAppConnection(userEmail: string, accountKeyInput?: string | null) {
  const context = await getWhatsappContext(userEmail);
  const accountKey = normalizeAccountKey(accountKeyInput);
  const status = await getEvolutionStatus({ userEmail: context.ownerEmail, accountKey });

  return {
    connected: status.connected,
    provider: "evolution",
    accountKey,
    instanceName: status.instanceName,
    state: status.state,
    checkedAt: status.lastCheckedAt,
  };
}

export async function getSessionFollowUpSettings(userEmail: string) {
  const context = await getWhatsappContext(userEmail);
  const defaults = (context.business as Record<string, unknown>).automationDefaults as Record<string, unknown> | undefined;
  const followUp = defaults?.sessionFollowUp as Record<string, unknown> | undefined;

  return {
    nudgeAfterSeconds: Number(followUp?.nudgeAfterSeconds || 120),
    closeAfterSeconds: Number(followUp?.closeAfterSeconds || 30),
    nudgeMessage: String(followUp?.nudgeMessage || "Are you still there? I can help you with the next step whenever you are ready."),
    closeMessage: String(followUp?.closeMessage || "I will pause this chat for now. Message me anytime and we can continue from here."),
    updatedAt: followUp?.updatedAt || null,
  };
}

export async function updateSessionFollowUpSettings(userEmail: string, input: {
  nudgeAfterSeconds: number;
  closeAfterSeconds: number;
  nudgeMessage: string;
  closeMessage: string;
}) {
  const context = await getWhatsappContext(userEmail);
  const now = new Date();
  const nudgeAfterSeconds = Math.max(30, Math.min(Number(input.nudgeAfterSeconds || 120), 86_400));
  const closeAfterSeconds = Math.max(30, Math.min(Number(input.closeAfterSeconds || 30), 86_400));
  const nudgeMessage = String(input.nudgeMessage || "").trim();
  const closeMessage = String(input.closeMessage || "").trim();
  if (!nudgeMessage) throw new Error("nudgeMessage is required");
  if (!closeMessage) throw new Error("closeMessage is required");

  const db = await getDb();
  await db.collection("businesses").updateOne(
    { _id: new ObjectId(context.businessId) },
    {
      $set: {
        "automationDefaults.sessionFollowUp.nudgeAfterSeconds": nudgeAfterSeconds,
        "automationDefaults.sessionFollowUp.closeAfterSeconds": closeAfterSeconds,
        "automationDefaults.sessionFollowUp.nudgeMessage": nudgeMessage,
        "automationDefaults.sessionFollowUp.closeMessage": closeMessage,
        "automationDefaults.sessionFollowUp.updatedAt": now,
        updatedAt: now,
      },
    },
  );

  return {
    nudgeAfterSeconds,
    closeAfterSeconds,
    nudgeMessage,
    closeMessage,
    updatedAt: now,
  };
}
