import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import type {
  AutomationContext,
  AutomationDocument,
  AutomationTriggerType,
} from "@/lib/automation/types";
import { evaluateConditions } from "@/lib/automation/conditionEvaluator";
import { executeActions } from "@/lib/automation/actionExecutor";
import {
  createAutomationRun,
  updateAutomationRun,
  updateAutomationStats,
} from "@/lib/automation/automationLogger";

/**
 * Rate-limit cache to prevent automation loops.
 * Key: `${businessId}:${customerId}` → timestamps of recent auto-replies.
 */
const replyRateCache = new Map<string, number[]>();

const RATE_LIMIT_WINDOW_MS = 30_000; // 30 seconds
const RATE_LIMIT_MAX_PER_WINDOW = 1;
const RATE_LIMIT_HOURLY_MAX = 5;
const RATE_LIMIT_HOURLY_WINDOW_MS = 3_600_000; // 1 hour

function automationTrace(step: number, message: string, metadata?: Record<string, unknown>) {
  console.info(`[AutomationEngine][step ${step}] ${message}`, metadata || "");
}

function checkRateLimit(businessId: string, customerId: string): boolean {
  const key = `${businessId}:${customerId}`;
  const now = Date.now();
  const timestamps = (replyRateCache.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_HOURLY_WINDOW_MS,
  );

  // Check short window
  const recentCount = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS).length;
  if (recentCount >= RATE_LIMIT_MAX_PER_WINDOW) return false;

  // Check hourly limit
  if (timestamps.length >= RATE_LIMIT_HOURLY_MAX) return false;

  timestamps.push(now);
  replyRateCache.set(key, timestamps);
  return true;
}

/**
 * Matches a trigger type against automations.
 * Returns active automations for the given business and trigger.
 */
async function findMatchingAutomations(
  businessId: string,
  triggerType: AutomationTriggerType,
  accountKey: string,
): Promise<AutomationDocument[]> {
  const db = await getDb();
  const automations = await db.collection<AutomationDocument>("automations")
    .find({
      businessId: new ObjectId(businessId),
      $or: [{ accountKey }, { accountKey: { $exists: false } }],
      status: "active",
      "trigger.type": triggerType,
    })
    .toArray();
  automationTrace(5, "Matching automations queried", {
    businessId,
    triggerType,
    count: automations.length,
    automationIds: automations.map((automation) => automation._id.toString()),
  });
  return automations;
}

/**
 * Check if the business is eligible for running automations.
 */
async function isBusinessEligible(businessId: string): Promise<boolean> {
  const db = await getDb();
  const business = await db.collection("businesses").findOne({
    _id: new ObjectId(businessId),
  });

  if (!business) {
    automationTrace(3, "Business eligibility failed: business not found", { businessId });
    return false;
  }
  if (business.status === "suspended" || business.status === "cancelled") {
    automationTrace(3, "Business eligibility failed: inactive status", { businessId, status: business.status });
    return false;
  }
  automationTrace(3, "Business eligibility passed", { businessId, status: business.status });
  return true;
}

/**
 * Run a single automation against the context.
 */
async function runSingleAutomation(
  automation: AutomationDocument,
  context: AutomationContext,
): Promise<void> {
  const automationId = automation._id.toString();
  automationTrace(6, "Starting automation run", {
    automationId,
    automationName: automation.name,
    triggerType: context.triggerType,
    customerId: context.customer.customerId,
  });

  // Create run entry
  const runId = await createAutomationRun({
    businessId: context.businessId,
    automationId,
    automationName: automation.name,
    customerId: context.customer.customerId,
    customerName: context.customer.customerName,
    messageId: context.message?.id,
    triggerType: context.triggerType,
  });

  try {
    // Evaluate conditions
    automationTrace(7, "Evaluating conditions", {
      automationId,
      conditionCount: automation.conditions.length,
      conditionLogic: automation.conditionLogic,
    });
    const conditionResult = evaluateConditions(
      automation.conditions,
      automation.conditionLogic,
      context,
    );
    automationTrace(8, "Condition evaluation complete", {
      automationId,
      passed: conditionResult.passed,
      results: conditionResult.results,
    });

    await updateAutomationRun(runId, {
      conditionResults: conditionResult.results,
    });

    if (!conditionResult.passed) {
      await updateAutomationRun(runId, { status: "skipped" });
      await updateAutomationStats(automationId, "skipped");
      automationTrace(9, "Automation skipped because conditions did not pass", { automationId, runId });
      return;
    }

    // Execute actions
    automationTrace(10, "Executing actions", {
      automationId,
      actionCount: automation.actions.length,
      actions: automation.actions.map((action) => ({ id: action.id, type: action.type, order: action.order })),
    });
    const actionResult = await executeActions(automation.actions, context);
    automationTrace(11, "Action execution complete", {
      automationId,
      allSuccess: actionResult.allSuccess,
      results: actionResult.results,
    });

    await updateAutomationRun(runId, {
      status: actionResult.allSuccess ? "success" : "failed",
      actionResults: actionResult.results,
      error: actionResult.allSuccess
        ? undefined
        : actionResult.results.find((r) => r.status === "failed")?.error,
    });

    await updateAutomationStats(
      automationId,
      actionResult.allSuccess ? "success" : "failed",
    );
    automationTrace(12, "Automation run saved", {
      automationId,
      runId,
      status: actionResult.allSuccess ? "success" : "failed",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAutomationRun(runId, {
      status: "failed",
      error: errorMessage,
    });
    await updateAutomationStats(automationId, "failed");
    console.error(`[AutomationEngine] Error running automation ${automationId}:`, errorMessage);
    automationTrace(12, "Automation run failed with exception", { automationId, runId, error: errorMessage });
  }
}

/**
 * Main entry point: run all matching automations for a trigger event.
 *
 * Anti-loop protections:
 * 1. Only runs for customer messages (source = "customer")
 * 2. Rate-limits auto-replies per customer
 * 3. Skips if customer has automationPaused = true
 * 4. Skips suspended businesses
 */
export async function runAutomations(context: AutomationContext): Promise<void> {
  automationTrace(1, "runAutomations called", {
    businessId: context.businessId,
    triggerType: context.triggerType,
    customerId: context.customer.customerId,
    messageId: context.message?.id,
    messageSource: context.message?.source,
  });

  // Anti-loop: skip non-customer messages
  if (context.message?.source && context.message.source !== "customer") {
    console.info(`[AutomationEngine] Skipping non-customer message source: ${context.message.source}`);
    return;
  }

  // Skip if customer paused automation
  if (context.customer.automationPaused) {
    console.info(`[AutomationEngine] Automation paused for customer: ${context.customer.customerId}`);
    automationTrace(2, "Automation skipped: customer automation paused", {
      customerId: context.customer.customerId,
    });
    return;
  }

  // Check business eligibility
  if (!(await isBusinessEligible(context.businessId))) {
    console.info(`[AutomationEngine] Business ${context.businessId} is not eligible`);
    return;
  }

  // Rate limit check
  if (!checkRateLimit(context.businessId, context.customer.customerId)) {
    console.info(`[AutomationEngine] Rate limit hit for customer: ${context.customer.customerId}`);
    automationTrace(4, "Automation skipped: rate limit hit", {
      businessId: context.businessId,
      customerId: context.customer.customerId,
    });
    return;
  }
  automationTrace(4, "Rate limit passed", {
    businessId: context.businessId,
    customerId: context.customer.customerId,
  });

  // Find matching automations
  const automations = await findMatchingAutomations(
    context.businessId,
    context.triggerType,
    String(context.metadata?.accountKey || "primary"),
  );
  if (!automations.length) {
    automationTrace(6, "No active automations matched trigger", {
      businessId: context.businessId,
      triggerType: context.triggerType,
    });
    return;
  }

  console.info(
    `[AutomationEngine] Found ${automations.length} automation(s) for trigger "${context.triggerType}" in business ${context.businessId}`,
  );

  // Run automations sequentially
  for (const automation of automations) {
    try {
      await runSingleAutomation(automation, context);
    } catch (error) {
      console.error(
        `[AutomationEngine] Unhandled error in automation ${automation._id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
