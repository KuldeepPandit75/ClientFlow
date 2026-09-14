import { fail, ok } from "@/lib/backend/response";
import { getState } from "@/lib/backend/store";
import { getDb } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { runAutomations } from "@/lib/automation/automationEngine";
import { scheduleSessionFollowUp } from "@/lib/automation/sessionManager";
import type { AutomationTriggerType, MessageSource } from "@/lib/automation/types";
import {
  buildEvolutionEventKey,
  extractEvolutionInstanceName,
} from "@/lib/evolution/webhook-routing.mjs";

function webhookTrace(step: number, message: string, metadata?: Record<string, unknown>) {
  console.info(`[EvolutionWebhook][step ${step}] ${message}`, metadata || "");
}

function getFirstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) || null;
}

function extractMessageText(data: Record<string, unknown>): string {
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return "";
  return (
    (message.conversation as string) ||
    ((message.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ((message.imageMessage as Record<string, unknown>)?.caption as string) ||
    ((message.videoMessage as Record<string, unknown>)?.caption as string) ||
    ""
  );
}

function getMessageType(data: Record<string, unknown>): string {
  const msgType = (data.messageType as string) || "";
  if (msgType) return msgType.replace(/Message$/i, "").toLowerCase() || "text";
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return "text";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  return "text";
}

export async function handleEvolutionWebhook(request: Request) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const expectedAuth = secret ? `Bearer ${secret}` : null;

  if (expectedAuth && request.headers.get("authorization") !== expectedAuth) {
    return fail("Invalid Evolution webhook signature", 401);
  }

  const body = await request.json();
  const event = body.event || body.type || "";
  const data = body.data || body;
  const instanceName = extractEvolutionInstanceName(body);
  const eventKey = buildEvolutionEventKey(body);
  const receivedAt = new Date();
  webhookTrace(1, "Webhook received", {
    event,
    instance: instanceName,
    hasData: Boolean(body.data),
  });

  const db = await getDb();

  // Ensure unique dedup index exists. Use partialFilterExpression instead of sparse
  // because sparse indexes still fail if the field exists with value null.
  try {
    await db.collection("webhook_events").createIndex(
      { eventKey: 1 },
      {
        unique: true,
        partialFilterExpression: { eventKey: { $type: "string" } },
        name: "webhook_events_event_key_unique_v2",
      },
    );
    // Drop the old problematic index if it exists
    await db.collection("webhook_events").dropIndex("webhook_events_event_key_unique").catch(() => {});
  } catch {
    // Index may already exist, ignore
  }

  let eventLog;
  try {
    eventLog = await db.collection("webhook_events").insertOne({
      provider: "evolution",
      event,
      ...(eventKey ? { eventKey } : {}),
      instanceName,
      payload: body,
      status: "received",
      receivedAt,
      processedAt: null,
      error: null,
      retryCount: 0,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return ok({ received: true, duplicate: true });
    }
    throw error;
  }

  // ─── Connection state updates ───
  const state = getFirstString(
    data.state, data.status, data.instance?.state,
    data.instance?.status, data.connection?.state,
  );
  const qrCode = getFirstString(
    data.base64, data.qrcode?.base64, data.qrCode, body.base64, body.qrcode?.base64,
  );
  const rawQrCode = getFirstString(data.code, data.qrcode?.code, body.code, body.qrcode?.code);
  const pairingCode = getFirstString(data.pairingCode, body.pairingCode);

  const whatsapp = getState().whatsapp;
  whatsapp.provider = "evolution";
  whatsapp.connected = state === "open" || whatsapp.connected;
  whatsapp.evolution = {
    configured: whatsapp.evolution?.configured ?? true,
    instanceName: whatsapp.evolution?.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "clientflow",
    baseUrl: whatsapp.evolution?.baseUrl || process.env.EVOLUTION_API_BASE_URL || "http://localhost:8080",
    state: state || whatsapp.evolution?.state || "unknown",
    qrCode: qrCode || whatsapp.evolution?.qrCode || null,
    rawQrCode: rawQrCode || whatsapp.evolution?.rawQrCode || null,
    pairingCode: pairingCode || whatsapp.evolution?.pairingCode || null,
    qrCount: typeof data.count === "number" ? data.count : whatsapp.evolution?.qrCount ?? null,
    lastCheckedAt: new Date().toISOString(),
    message: qrCode
      ? "Evolution QR code updated."
      : state
        ? `Evolution connection state: ${state}`
        : "Evolution webhook received.",
  };

  if (instanceName && state) {
    await db.collection("whatsapp_sessions").updateOne(
      { instanceName },
      {
        $set: {
          status: state === "open" ? "connected" : state,
          lastSyncAt: receivedAt,
          updatedAt: receivedAt,
          ...(state === "open" ? { lastConnectedAt: receivedAt } : {}),
        },
      },
    );
  }

  // ─── Message events → Automation engine ───
  const isMessageEvent = event === "MESSAGES_UPSERT" || event === "messages.upsert" || !event;
  const key = data.key || {};
  const remoteJid = key.remoteJid as string | undefined;
  const fromMe = key.fromMe === true;
  webhookTrace(2, "Message event parsed", {
    isMessageEvent,
    remoteJid,
    fromMe,
    isGroup: remoteJid?.endsWith("@g.us") || false,
    isBroadcast: remoteJid === "status@broadcast",
  });

  let processingError: Error | null = null;
  if (isMessageEvent && remoteJid && !fromMe && !remoteJid.endsWith("@g.us") && remoteJid !== "status@broadcast") {
    try {
      webhookTrace(3, "Processing incoming customer message", {
        remoteJid,
        messageText: extractMessageText(data)?.slice(0, 50) || "(no text)",
      });
      if (!instanceName) throw new Error("Evolution webhook instance name is missing");
      await processIncomingMessage(data, remoteJid, instanceName);
    } catch (error) {
      processingError = error instanceof Error ? error : new Error(String(error));
      console.error("[Webhook] Automation error:", processingError.message);
      await db.collection("webhook_events").updateOne(
        { _id: eventLog.insertedId },
        {
          $set: {
            status: "failed",
            processedAt: new Date(),
            error: processingError.message,
          },
          $inc: { retryCount: 1 },
        },
      );
    }

  }

  if (processingError) {
    return fail(processingError.message, processingError.message.includes("Unknown Evolution instance") ? 404 : 500);
  }

  await db.collection("webhook_events").updateOne(
    { _id: eventLog.insertedId, status: "received" },
    { $set: { status: "processed", processedAt: new Date() } },
  );

  return ok({ received: true });
}

async function processIncomingMessage(data: Record<string, unknown>, remoteJid: string, instanceName: string) {
  const db = await getDb();

  // Resolve the exact stored instance. Never route an unknown instance to a default tenant.
  webhookTrace(4, "Resolving business for Evolution instance", { instanceName });
  const session = await db.collection("whatsapp_sessions").findOne({
    instanceName,
  });

  if (!session?.businessId) {
    throw new Error(`Unknown Evolution instance: ${instanceName}`);
  }

  webhookTrace(5, "WhatsApp session matched", {
    sessionInstanceName: session.instanceName,
    businessId: session.businessId.toString(),
    accountKey: session.accountKey || "primary",
  });
  await runAutomationForBusiness(db, session.businessId.toString(), data, remoteJid, {
    whatsappSessionId: session._id,
    accountKey: String(session.accountKey || "primary"),
  });
}

async function runAutomationForBusiness(
  db: Awaited<ReturnType<typeof getDb>>,
  businessId: string,
  data: Record<string, unknown>,
  remoteJid: string,
  account: { whatsappSessionId: ObjectId; accountKey: string },
) {
  const businessObjectId = new ObjectId(businessId);

  // Find or create customer
  const now = new Date();
  const messageText = extractMessageText(data);
  const messageType = getMessageType(data);
  const key = data.key || {} as Record<string, unknown>;
  const messageId = (key as Record<string, unknown>).id as string || `msg_${Date.now()}`;
  const pushName = (data.pushName as string) || "";
  webhookTrace(6, "Incoming message normalized", {
    businessId,
    remoteJid,
    messageId,
    messageType,
    hasText: Boolean(messageText),
    pushName,
  });

  await db.collection("messages").createIndex(
    { businessId: 1, whatsappSessionId: 1, messageId: 1 },
    { unique: true, sparse: true, name: "messages_tenant_session_external_unique" },
  );
  const duplicateMessage = await db.collection("messages").findOne({
    businessId: businessObjectId,
    whatsappSessionId: account.whatsappSessionId,
    messageId,
  });
  if (duplicateMessage) {
    webhookTrace(6, "Incoming message already processed", { businessId, messageId });
    return;
  }

  // Check if customer exists
  const existingCustomer = await db.collection("customers").findOne({
    businessId: businessObjectId,
    customerId: remoteJid,
  });

  const isFirstMessage = !existingCustomer;
  const previousSession = existingCustomer?.automationSession as
    | { status?: "active" | "closed"; version?: number }
    | undefined;
  const sessionVersion = Number(previousSession?.version || 0) + 1;
  const isNewSession = !previousSession || previousSession.status === "closed";
  webhookTrace(7, "Customer lookup complete", {
    isFirstMessage,
    existingCustomerId: existingCustomer?._id?.toString(),
    previousSessionStatus: previousSession?.status || null,
    sessionVersion,
  });

  // Upsert customer
  await db.collection("customers").updateOne(
    { businessId: businessObjectId, customerId: remoteJid },
    {
      $set: {
        whatsappSessionId: account.whatsappSessionId,
        accountKey: account.accountKey,
        lastMessage: messageText || "[Message]",
        lastMessageAt: now.getTime(),
        lastIncomingMessageAt: now,
        conversationStatus: "open",
        automationPaused: false,
        "automationSession.status": "active",
        "automationSession.version": sessionVersion,
        "automationSession.lastCustomerMessageAt": now,
        "automationSession.nudgeSentAt": null,
        "automationSession.nudgeSentForVersion": null,
        "automationSession.closedForVersion": null,
        updatedAt: now,
        ...(pushName ? { customerName: pushName } : {}),
      },
      $setOnInsert: {
        businessId: businessObjectId,
        customerId: remoteJid,
        customerName: pushName || remoteJid.split("@")[0] || "Unknown",
        phone: `+${remoteJid.split("@")[0]?.replace(/\D/g, "")}`,
        assignedAgentId: null,
        tags: [],
        status: "new",
        isFirstMessage: true,
        firstMessageAt: now,
        source: "evolution",
        "automationSession.openedAt": now,
        createdAt: now,
      },
      $inc: { messageCount: 1, unreadCount: 1 },
    },
    { upsert: true },
  );
  webhookTrace(8, "Customer upserted", { remoteJid });

  // Save incoming message
  await db.collection("messages").insertOne({
    businessId: businessObjectId,
    whatsappSessionId: account.whatsappSessionId,
    accountKey: account.accountKey,
    customerId: remoteJid,
    messageId,
    direction: "incoming",
    messageType,
    text: messageText,
    senderType: "customer",
    source: "customer" as MessageSource,
    automationId: null,
    aiGenerated: false,
    createdAt: now,
  });
  webhookTrace(9, "Incoming message saved", { messageId, remoteJid });

  // Get updated customer data
  const customer = await db.collection("customers").findOne({
    businessId: businessObjectId,
    customerId: remoteJid,
  });

  if (!customer) return;

  // Determine trigger types to fire
  const triggers: AutomationTriggerType[] = ["new_message_received"];
  if (isFirstMessage) {
    triggers.push("first_message_from_customer", "new_customer_created");
  }

  // Keyword matching is handled within conditions, but we fire keyword_matched trigger too
  triggers.push("keyword_matched");
  webhookTrace(10, "Automation triggers selected", { triggers, remoteJid });

  // Run automations for each applicable trigger
  for (const triggerType of triggers) {
    webhookTrace(11, "Running automation trigger", { triggerType, remoteJid });
    await runAutomations({
      businessId,
      triggerType,
      customer: {
        customerId: remoteJid,
        customerName: customer.customerName || pushName || remoteJid,
        phone: customer.phone || "",
        assignedAgentId: customer.assignedAgentId?.toString() || null,
        tags: customer.tags || [],
        status: customer.status || "new",
        isFirstMessage,
        firstMessageAt: customer.firstMessageAt || null,
        lastMessageAt: customer.lastMessageAt ? new Date(customer.lastMessageAt) : null,
        lastIncomingMessageAt: customer.lastIncomingMessageAt || null,
        lastOutgoingMessageAt: customer.lastOutgoingMessageAt || null,
        automationPaused: customer.automationPaused || false,
        messageCount: customer.messageCount || 1,
      },
      message: {
        id: messageId,
        text: messageText,
        direction: "incoming",
        messageType,
        source: "customer",
      },
      metadata: {
        accountKey: account.accountKey,
        whatsappSessionId: account.whatsappSessionId.toString(),
        session: {
          version: sessionVersion,
          isNewSession,
          previousStatus: previousSession?.status || null,
        },
      },
    });
  }

  await scheduleSessionFollowUp({
    businessId,
    customerId: remoteJid,
    customerName: customer.customerName || pushName || remoteJid,
    version: sessionVersion,
    accountKey: account.accountKey,
  });
}

export async function reprocessEvolutionWebhookEvent(eventId: string) {
  if (!ObjectId.isValid(eventId)) throw new Error("Invalid webhook event id");
  const db = await getDb();
  const event = await db.collection("webhook_events").findOne({ _id: new ObjectId(eventId) });
  if (!event) throw new Error("Webhook event not found");

  const body = event.payload as Record<string, unknown> | undefined;
  if (!body) throw new Error("Webhook event payload is missing");
  const data = (body.data || body) as Record<string, unknown>;
  const key = (data.key || {}) as Record<string, unknown>;
  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const instanceName = extractEvolutionInstanceName(body);
  if (!instanceName) throw new Error("Evolution webhook instance name is missing");
  if (!remoteJid) throw new Error("Evolution webhook customer JID is missing");

  await processIncomingMessage(data, remoteJid, instanceName);
  await db.collection("webhook_events").updateOne(
    { _id: event._id },
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        retriedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      },
      $inc: { retryCount: 1 },
    },
  );
  return { processed: true, eventId };
}
