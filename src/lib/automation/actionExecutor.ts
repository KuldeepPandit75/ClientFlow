import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { renderTemplate } from "@/lib/automation/templateRenderer";
import { sendEvolutionTextMessage, getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution/client";
import { buildKnowledgeContextForBusiness } from "@/lib/services/knowledge-service";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { enqueueJob } from "@/lib/services/job-service";
import type {
  AutomationAction,
  AutomationActionType,
  AutomationContext,
  AutomationSessionMetadata,
} from "@/lib/automation/types";

interface ActionResult {
  actionId: string;
  type: AutomationActionType;
  status: "success" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

function shouldEscalateToHuman(input: {
  generatedReply: string | null;
  fallbackMessage: string;
  knowledgeContext: string;
}) {
  if (!input.knowledgeContext.trim()) return true;
  if (!input.generatedReply) return true;
  const reply = input.generatedReply.toLowerCase();
  if (reply.includes("i'm not sure") || reply.includes("i am not sure")) return true;
  if (reply === input.fallbackMessage.toLowerCase()) return true;
  return false;
}

function actionTrace(step: number, message: string, metadata?: Record<string, unknown>) {
  console.info(`[AutomationAction][step ${step}] ${message}`, metadata || "");
}

/** Find the Evolution owner email for a business. */
async function getOwnerEmailForBusiness(businessId: string): Promise<string | null> {
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(businessId) });
  if (!business?.ownerUserId) return null;
  const owner = await db.collection<{ email: string }>("users").findOne({ _id: business.ownerUserId });
  return owner?.email || null;
}

/** Resolve template context from automation context. */
function buildTemplateContext(context: AutomationContext, businessName?: string) {
  return {
    customer: {
      name: context.customer.customerName || context.customer.phone || "Customer",
      phone: context.customer.phone || "",
    },
    business: {
      name: businessName || "Our Business",
    },
    agent: {
      name: "",
    },
    lastMessage: {
      text: context.message?.text || "",
    },
  };
}

function getAiProviderConfig() {
  const provider = (process.env.AI_PROVIDER || process.env.LLM_PROVIDER || "openrouter").toLowerCase();

  if (provider === "groq") {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY || process.env.AI_API_KEY || "",
      model: process.env.GROQ_MODEL || process.env.AI_MODEL || "llama-3.1-8b-instant",
      url: process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1/chat/completions",
      headers: {},
    };
  }

  return {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || "",
    model: process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "meta-llama/llama-3.2-3b-instruct:free",
    url: process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      ...(process.env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL } : {}),
      "X-Title": process.env.AI_APP_TITLE || "ClientFlow WhatsApp Automation",
    },
  };
}

async function generateAiReply(input: {
  instruction: string;
  fallbackMessage: string;
  customerName: string;
  businessName?: string;
  lastMessage?: string;
  chatHistory?: string;
  sessionInstruction?: string;
  tone?: string;
  language?: string;
}) {
  const aiConfig = getAiProviderConfig();
  actionTrace(20, "AI provider config resolved", {
    provider: aiConfig.provider,
    model: aiConfig.model,
    hasApiKey: Boolean(aiConfig.apiKey),
  });
  if (!aiConfig.apiKey) return null;

  actionTrace(21, "Calling AI provider", {
    provider: aiConfig.provider,
    model: aiConfig.model,
    hasLastMessage: Boolean(input.lastMessage),
  });
  const response = await fetch(aiConfig.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aiConfig.apiKey}`,
      ...aiConfig.headers,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: [
            "You write concise WhatsApp replies for a service business.",
            "Do not invent prices, guarantees, links, or availability.",
            "If the customer asks for details you do not know, ask one helpful qualifying question.",
            "Keep the reply natural, professional, and under 90 words.",
            input.sessionInstruction || "",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Business: ${input.businessName || "Software development service"}`,
            `Customer: ${input.customerName}`,
            `Tone: ${input.tone || "friendly and professional"}`,
            `Language: ${input.language || "auto-detect from customer message"}`,
            `Customer message: ${input.lastMessage || ""}`,
            input.chatHistory ? `Recent chat history:\n${input.chatHistory}` : "",
            `Business instructions and knowledge:\n${input.instruction}`,
            `Fallback reply if unsure:\n${input.fallbackMessage}`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI provider request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  actionTrace(22, "AI provider response parsed", {
    provider: aiConfig.provider,
    hasText: Boolean(text),
    textLength: text?.length || 0,
  });
  return text || null;
}

async function getRecentChatHistory(input: {
  businessId: string;
  customerId: string;
  limit: number;
}) {
  const db = await getDb();
  const messages = await db.collection<{
    direction?: "incoming" | "outgoing";
    text?: string;
    createdAt?: Date;
  }>("messages")
    .find({
      businessId: new ObjectId(input.businessId),
      customerId: input.customerId,
      text: { $type: "string", $ne: "" },
    })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(input.limit, 2), 30))
    .toArray();

  return messages
    .reverse()
    .map((message) => `${message.direction === "incoming" ? "Customer" : "Business"}: ${message.text}`)
    .join("\n");
}

function getSessionMetadata(context: AutomationContext): AutomationSessionMetadata | null {
  const session = context.metadata?.session;
  if (!session || typeof session !== "object") return null;
  return session as AutomationSessionMetadata;
}

function getAutomationAccountKey(context: AutomationContext) {
  return String(context.metadata?.accountKey || "primary");
}

async function executeSendTextMessage(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };
  actionTrace(1, "send_text_message action started", {
    actionId: action.id,
    customerId: context.customer.customerId,
  });

  try {
    const messageTemplate = String(action.config.message || "");
    if (!messageTemplate) {
      return { ...base, status: "failed", error: "No message text configured" };
    }

    const ownerEmail = await getOwnerEmailForBusiness(context.businessId);
    actionTrace(2, "Business owner resolved for text send", {
      businessId: context.businessId,
      hasOwnerEmail: Boolean(ownerEmail),
    });
    if (!ownerEmail) {
      return { ...base, status: "failed", error: "Business owner not found" };
    }

    const accountKey = getAutomationAccountKey(context);
    const config = getEvolutionConfig({ userEmail: ownerEmail, accountKey });
    actionTrace(3, "Evolution config checked for text send", {
      baseUrl: config.baseUrl,
      instanceName: config.instanceName,
      configured: isEvolutionConfigured(config),
    });
    if (!isEvolutionConfigured(config)) {
      return { ...base, status: "failed", error: "Evolution API not configured" };
    }

    // Fetch business name for template
    const db = await getDb();
    const business = await db.collection("businesses").findOne({ _id: new ObjectId(context.businessId) });
    const templateContext = buildTemplateContext(context, business?.name);
    const renderedMessage = renderTemplate(messageTemplate, templateContext);
    actionTrace(4, "Text message rendered", {
      actionId: action.id,
      textLength: renderedMessage.length,
    });

    actionTrace(5, "Sending text message via Evolution", {
      actionId: action.id,
      customerId: context.customer.customerId,
    });
    await sendEvolutionTextMessage(context.customer.customerId, renderedMessage, { userEmail: ownerEmail, accountKey });
    actionTrace(6, "Evolution text send complete", { actionId: action.id });

    // Save outgoing message record
    const now = new Date();
    await db.collection("messages").insertOne({
      businessId: new ObjectId(context.businessId),
      accountKey,
      customerId: context.customer.customerId,
      direction: "outgoing",
      messageType: "text",
      text: renderedMessage,
      senderType: "system",
      source: "automation",
      automationId: null,
      aiGenerated: false,
      createdAt: now,
    });

    return { ...base, status: "success", result: { messageSent: renderedMessage } };
  } catch (error) {
    actionTrace(99, "send_text_message action failed", {
      actionId: action.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeAddTag(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };
  actionTrace(1, "send_ai_reply action started", {
    actionId: action.id,
    customerId: context.customer.customerId,
    mode: action.config.mode || "auto_send",
  });

  try {
    const tag = String(action.config.tag || "").trim();
    if (!tag) return { ...base, status: "failed", error: "No tag specified" };

    const db = await getDb();
    await db.collection("customers").updateOne(
      { businessId: new ObjectId(context.businessId), customerId: context.customer.customerId },
      {
        $addToSet: { tags: tag },
        $set: { updatedAt: new Date() },
      },
    );

    return { ...base, status: "success", result: { tagAdded: tag } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeRemoveTag(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const tag = String(action.config.tag || "").trim();
    if (!tag) return { ...base, status: "failed", error: "No tag specified" };

    const db = await getDb();
    await (db.collection("customers") as any).updateOne(
      { businessId: new ObjectId(context.businessId), customerId: context.customer.customerId },
      {
        $pull: { tags: tag },
        $set: { updatedAt: new Date() },
      },
    );

    return { ...base, status: "success", result: { tagRemoved: tag } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeUpdateCustomerStatus(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const status = String(action.config.status || "").trim();
    if (!status) return { ...base, status: "failed", error: "No status specified" };

    const db = await getDb();
    await db.collection("customers").updateOne(
      { businessId: new ObjectId(context.businessId), customerId: context.customer.customerId },
      {
        $set: { status, updatedAt: new Date() },
      },
    );

    return { ...base, status: "success", result: { statusUpdated: status } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeAssignAgent(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const agentId = String(action.config.agentId || "");
    if (!agentId || !ObjectId.isValid(agentId)) {
      return { ...base, status: "failed", error: "Invalid agent ID" };
    }

    const db = await getDb();
    const agent = await db.collection("users").findOne({
      _id: new ObjectId(agentId),
      businessId: new ObjectId(context.businessId),
      role: "sub_agent",
      status: "active",
    });

    if (!agent) return { ...base, status: "failed", error: "Agent not found in this business" };

    await db.collection("customers").updateOne(
      { businessId: new ObjectId(context.businessId), customerId: context.customer.customerId },
      {
        $set: { assignedAgentId: agent._id, updatedAt: new Date() },
      },
    );

    return { ...base, status: "success", result: { assignedAgent: agent.name } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeAssignRoundRobin(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const db = await getDb();
    const businessObjectId = new ObjectId(context.businessId);

    // Find active sub-agents for this business
    const agents = await db.collection("users")
      .find({
        businessId: businessObjectId,
        role: "sub_agent",
        status: "active",
      })
      .toArray();

    if (!agents.length) {
      return { ...base, status: "skipped", result: { reason: "No active sub-agents" } };
    }

    // Count assigned active customers per agent
    const agentCounts = await Promise.all(
      agents.map(async (agent) => {
        const count = await db.collection("customers").countDocuments({
          businessId: businessObjectId,
          assignedAgentId: agent._id,
        });
        return { agent, count };
      }),
    );

    // Pick agent with lowest count
    agentCounts.sort((a, b) => a.count - b.count);
    const selected = agentCounts[0];

    await db.collection("customers").updateOne(
      { businessId: businessObjectId, customerId: context.customer.customerId },
      {
        $set: { assignedAgentId: selected.agent._id, updatedAt: new Date() },
      },
    );

    return { ...base, status: "success", result: { assignedAgent: selected.agent.name, assignedCount: selected.count } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeCreateInternalNote(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const note = String(action.config.note || "").trim();
    if (!note) return { ...base, status: "failed", error: "No note text specified" };

    const db = await getDb();
    await db.collection("customer_notes").insertOne({
      businessId: new ObjectId(context.businessId),
      customerId: context.customer.customerId,
      note,
      source: "automation",
      createdAt: new Date(),
    });

    return { ...base, status: "success", result: { noteCreated: true } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeNotifyAdmin(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const message = String(action.config.message || `Automation triggered for ${context.customer.customerName}`);
    const db = await getDb();

    // Find admin(s) for this business
    const business = await db.collection("businesses").findOne({ _id: new ObjectId(context.businessId) });
    if (!business?.ownerUserId) return { ...base, status: "failed", error: "Business owner not found" };

    await db.collection("notifications").insertOne({
      userId: business.ownerUserId,
      businessId: new ObjectId(context.businessId),
      type: "automation",
      title: "Automation Notification",
      message,
      customerId: context.customer.customerId,
      read: false,
      createdAt: new Date(),
    });

    return { ...base, status: "success", result: { notified: true } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeNotifyAgent(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    const agentId = context.customer.assignedAgentId;
    if (!agentId) return { ...base, status: "skipped", result: { reason: "No agent assigned" } };

    const message = String(action.config.message || `Customer ${context.customer.customerName} requires attention`);
    const db = await getDb();

    await db.collection("notifications").insertOne({
      userId: new ObjectId(agentId),
      businessId: new ObjectId(context.businessId),
      type: "automation",
      title: "Automation Notification",
      message,
      customerId: context.customer.customerId,
      read: false,
      createdAt: new Date(),
    });

    return { ...base, status: "success", result: { notified: true } };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function executeSendAiReply(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  const base = { actionId: action.id, type: action.type };

  try {
    // For MVP, send a templated fallback if no AI provider is configured
    const config = action.config;
    const fallbackMessage = String(config.fallbackMessage || "Thank you for your message. Our team will get back to you shortly.");
    let instruction = String(config.instruction || "");
    const mode = String(config.mode || "auto_send");
    const useChatHistory = config.useChatHistory === true || config.sessionMode === true || config.manageSession === true;
    const session = getSessionMetadata(context);
    const shouldGreet = Boolean(context.customer.isFirstMessage) && config.greetOnce !== false;
    const sessionInstruction = shouldGreet
      ? "This is the first customer message. A short greeting is okay once."
      : [
          "This is an existing chat. Do not greet again.",
          "Do not start with Hi, Hello, Hey, thanks for reaching out, or the customer name.",
          "Continue naturally from the recent context and answer the latest message directly.",
        ].join(" ");

    const ownerEmail = await getOwnerEmailForBusiness(context.businessId);
    actionTrace(2, "Business owner resolved for AI reply", {
      businessId: context.businessId,
      hasOwnerEmail: Boolean(ownerEmail),
    });
    if (!ownerEmail) {
      return { ...base, status: "failed", error: "Business owner not found" };
    }

    const db = await getDb();
    const business = await db.collection("businesses").findOne({ _id: new ObjectId(context.businessId) });
    const plan = String((business as Record<string, unknown> | null)?.plan || "free") as keyof typeof PLAN_LIMITS;
    const aiLimit = PLAN_LIMITS[plan]?.maxAiResponsesPerMonth || 200;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const aiUsedThisMonth = await db.collection("messages").countDocuments({
      businessId: new ObjectId(context.businessId),
      aiGenerated: true,
      createdAt: { $gte: monthStart },
    });
    if (aiUsedThisMonth >= aiLimit) {
      return { ...base, status: "failed", error: `AI monthly limit reached (${aiLimit}) for current plan` };
    }

    let replyText = fallbackMessage;
    const templateContext = buildTemplateContext(context, business?.name);
    instruction = renderTemplate(instruction, templateContext);

    if (instruction) {
      try {
        const knowledgeContext = await buildKnowledgeContextForBusiness(context.businessId, 6);
        const chatHistory = useChatHistory
          ? await getRecentChatHistory({
              businessId: context.businessId,
              customerId: context.customer.customerId,
              limit: Number(config.maxHistoryMessages || 12),
            })
          : "";
        const generatedReply = await generateAiReply({
          instruction: [instruction, knowledgeContext].filter(Boolean).join("\n\n"),
          fallbackMessage,
          customerName: templateContext.customer.name,
          businessName: templateContext.business.name,
          lastMessage: context.message?.text,
          chatHistory,
          sessionInstruction,
          tone: String(config.tone || "friendly and professional"),
          language: String(config.language || "auto"),
        });
        const escalated = shouldEscalateToHuman({
          generatedReply,
          fallbackMessage,
          knowledgeContext,
        });
        if (escalated) {
          await db.collection("customers").updateOne(
            { businessId: new ObjectId(context.businessId), customerId: context.customer.customerId },
            {
              $set: {
                status: "needs_human",
                handoverRequestedAt: new Date(),
                updatedAt: new Date(),
              },
            },
          );
          replyText = "I want to make sure you get the right answer. I’m connecting you with a human teammate now.";
        } else {
          replyText = generatedReply || fallbackMessage;
        }
        actionTrace(23, "AI reply selected", {
          actionId: action.id,
          usedAi: Boolean(generatedReply),
          textLength: replyText.length,
          usedChatHistory: Boolean(chatHistory),
          sessionVersion: session?.version,
          isNewSession: session?.isNewSession,
          shouldGreet,
        });
      } catch (error) {
        console.warn(
          "[Automation] AI reply generation failed, using fallback:",
          error instanceof Error ? error.message : error,
        );
        actionTrace(23, "AI reply failed; fallback selected", {
          actionId: action.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (mode === "draft") {
      // Save as draft, do not send
      await db.collection("ai_draft_replies").insertOne({
        businessId: new ObjectId(context.businessId),
        customerId: context.customer.customerId,
        text: replyText,
        instruction,
        status: "draft",
        createdAt: new Date(),
      });
      return { ...base, status: "success", result: { drafted: true, text: replyText } };
    }

    // Auto-send mode
    const accountKey = getAutomationAccountKey(context);
    const evoConfig = getEvolutionConfig({ userEmail: ownerEmail, accountKey });
    actionTrace(24, "Evolution config checked for AI reply send", {
      baseUrl: evoConfig.baseUrl,
      instanceName: evoConfig.instanceName,
      configured: isEvolutionConfigured(evoConfig),
    });
    if (!isEvolutionConfigured(evoConfig)) {
      return { ...base, status: "failed", error: "Evolution API not configured" };
    }

    const renderedReply = renderTemplate(replyText, templateContext);

    actionTrace(25, "Sending AI reply via Evolution", {
      actionId: action.id,
      customerId: context.customer.customerId,
      textLength: renderedReply.length,
    });
    await sendEvolutionTextMessage(context.customer.customerId, renderedReply, { userEmail: ownerEmail, accountKey });
    actionTrace(26, "Evolution AI reply send complete", { actionId: action.id });

    // Save outgoing message record
    const now = new Date();
    await db.collection("messages").insertOne({
      businessId: new ObjectId(context.businessId),
      accountKey,
      customerId: context.customer.customerId,
      direction: "outgoing",
      messageType: "text",
      text: renderedReply,
      senderType: "ai",
      source: "automation",
      automationId: null,
      aiGenerated: true,
      createdAt: now,
    });

    return { ...base, status: "success", result: { messageSent: renderedReply, aiGenerated: true } };
  } catch (error) {
    actionTrace(99, "send_ai_reply action failed", {
      actionId: action.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...base, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Execute a single action.
 */
export async function executeAction(
  action: AutomationAction,
  context: AutomationContext,
): Promise<ActionResult> {
  actionTrace(0, "Executing action", {
    actionId: action.id,
    type: action.type,
    customerId: context.customer.customerId,
  });
  switch (action.type) {
    case "send_text_message":
      return executeSendTextMessage(action, context);
    case "send_ai_reply":
      return executeSendAiReply(action, context);
    case "assign_agent":
      return executeAssignAgent(action, context);
    case "assign_round_robin":
      return executeAssignRoundRobin(action, context);
    case "add_tag":
      return executeAddTag(action, context);
    case "remove_tag":
      return executeRemoveTag(action, context);
    case "update_customer_status":
      return executeUpdateCustomerStatus(action, context);
    case "create_internal_note":
      return executeCreateInternalNote(action, context);
    case "notify_admin":
      return executeNotifyAdmin(action, context);
    case "notify_agent":
      return executeNotifyAgent(action, context);
    case "stop_automation":
      return { actionId: action.id, type: action.type, status: "success", result: { stopped: true } };
    case "wait_delay":
      return { actionId: action.id, type: action.type, status: "success", result: { queued: true } };
    default:
      return { actionId: action.id, type: action.type, status: "failed", error: `Unknown action type: ${action.type}` };
  }
}

/**
 * Execute all actions in order. Stops on failure unless continueOnError is set.
 */
export async function executeActions(
  actions: AutomationAction[],
  context: AutomationContext,
): Promise<{ results: ActionResult[]; allSuccess: boolean }> {
  const sorted = [...actions].sort((a, b) => a.order - b.order);
  actionTrace(0, "Executing action list", {
    actionCount: sorted.length,
    actions: sorted.map((action) => ({ id: action.id, type: action.type, order: action.order })),
  });
  const results: ActionResult[] = [];
  let allSuccess = true;

  for (let index = 0; index < sorted.length; index += 1) {
    const action = sorted[index];
    if (action.type === "wait_delay") {
      const delaySeconds = Math.min(Math.max(Number(action.config.delaySeconds || 60), 1), 86_400);
      const remainingActions = sorted.slice(index + 1);
      if (remainingActions.length > 0) {
        const messageKey = context.message?.id || `${context.customer.customerId}:${Date.now()}`;
        const job = await enqueueJob({
          type: "automation_resume",
          businessId: context.businessId,
          runAt: new Date(Date.now() + delaySeconds * 1_000),
          payload: { actions: remainingActions, context },
          dedupeKey: `automation_resume:${context.businessId}:${messageKey}:${action.id}`,
        });
        results.push({
          actionId: action.id,
          type: action.type,
          status: "success",
          result: { queued: true, delaySeconds, jobId: job.id },
        });
      } else {
        results.push({ actionId: action.id, type: action.type, status: "success", result: { queued: false, delaySeconds } });
      }
      break;
    }
    const result = await executeAction(action, context);
    results.push(result);

    if (result.type === "stop_automation" && result.status === "success") {
      break;
    }

    if (result.status === "failed") {
      allSuccess = false;
      if (!action.continueOnError) {
        break;
      }
    }
  }

  return { results, allSuccess };
}

export async function executeAutomationResume(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.actions) || !payload.context || typeof payload.context !== "object") {
    throw new Error("Invalid automation resume payload");
  }
  return executeActions(
    payload.actions as AutomationAction[],
    payload.context as AutomationContext,
  );
}
