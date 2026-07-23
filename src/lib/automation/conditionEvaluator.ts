import type {
  AutomationCondition,
  AutomationConditionType,
  AutomationContext,
  ConditionLogic,
} from "@/lib/automation/types";

interface ConditionResult {
  conditionId: string;
  type: AutomationConditionType;
  passed: boolean;
  reason?: string;
}

function evaluateSingleCondition(
  condition: AutomationCondition,
  context: AutomationContext,
): ConditionResult {
  const base = { conditionId: condition.id, type: condition.type };

  try {
    switch (condition.type) {
      case "message_contains": {
        const text = (context.message?.text || "").toLowerCase();
        const keywords = Array.isArray(condition.value)
          ? condition.value.map((k: string) => k.toLowerCase())
          : [String(condition.value || "").toLowerCase()];
        const matched = keywords.some((keyword: string) => text.includes(keyword));
        return { ...base, passed: matched, reason: matched ? `Message contains keyword` : `No keyword match` };
      }

      case "message_equals": {
        const text = (context.message?.text || "").trim().toLowerCase();
        const target = String(condition.value || "").trim().toLowerCase();
        const matched = text === target;
        return { ...base, passed: matched, reason: matched ? "Exact match" : "No exact match" };
      }

      case "customer_is_new": {
        const isNew = context.customer.isFirstMessage === true
          || (context.customer.messageCount !== undefined && context.customer.messageCount <= 1);
        const expected = condition.value !== false;
        const passed = isNew === expected;
        return { ...base, passed, reason: passed ? "Customer is new" : "Customer is not new" };
      }

      case "customer_has_tag": {
        const tags = context.customer.tags || [];
        const targetTag = String(condition.value || "").toLowerCase();
        const hasTag = tags.some((tag) => tag.toLowerCase() === targetTag);
        const passed = condition.operator === "not_equals" ? !hasTag : hasTag;
        return { ...base, passed, reason: passed ? `Has tag "${targetTag}"` : `Missing tag "${targetTag}"` };
      }

      case "customer_status_is": {
        const status = (context.customer.status || "").toLowerCase();
        const target = String(condition.value || "").toLowerCase();
        const passed = condition.operator === "not_equals"
          ? status !== target
          : status === target;
        return { ...base, passed, reason: passed ? `Status matches "${target}"` : `Status is "${status}", expected "${target}"` };
      }

      case "customer_assigned_to": {
        const agentId = context.customer.assignedAgentId || "";
        const targetAgent = String(condition.value || "");
        const passed = agentId === targetAgent;
        return { ...base, passed, reason: passed ? "Assigned to target agent" : "Not assigned to target agent" };
      }

      case "customer_unassigned": {
        const unassigned = !context.customer.assignedAgentId;
        const expected = condition.value !== false;
        const passed = unassigned === expected;
        return { ...base, passed, reason: passed ? "Customer is unassigned" : "Customer is assigned" };
      }

      case "message_type_is": {
        const msgType = (context.message?.messageType || "text").toLowerCase();
        const target = String(condition.value || "text").toLowerCase();
        const passed = msgType === target;
        return { ...base, passed, reason: passed ? `Type is "${target}"` : `Type is "${msgType}", expected "${target}"` };
      }

      case "business_hours": {
        const config = condition.config || {};
        const timezone = String(config.timezone || process.env.APP_TIME_ZONE || "Asia/Kolkata");
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "numeric",
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
        const startHour = Number(config.startHour ?? 9);
        const endHour = Number(config.endHour ?? 18);
        const passed = hour >= startHour && hour < endHour;
        return { ...base, passed, reason: passed ? "Within business hours" : "Outside business hours" };
      }

      case "ai_intent_is": {
        // For MVP, skip AI intent matching unless metadata provides it
        const detectedIntent = context.metadata?.aiIntent as string | undefined;
        if (!detectedIntent) {
          return { ...base, passed: false, reason: "AI intent classification not available" };
        }
        const target = String(condition.value || "").toLowerCase();
        const passed = detectedIntent.toLowerCase() === target;
        return { ...base, passed, reason: passed ? `Intent matches "${target}"` : `Intent is "${detectedIntent}"` };
      }

      default:
        return { ...base, passed: false, reason: `Unknown condition type: ${condition.type}` };
    }
  } catch (error) {
    return {
      ...base,
      passed: false,
      reason: `Error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export function evaluateConditions(
  conditions: AutomationCondition[],
  conditionLogic: ConditionLogic,
  context: AutomationContext,
): { passed: boolean; results: ConditionResult[] } {
  if (!conditions.length) {
    return { passed: true, results: [] };
  }

  const results = conditions.map((condition) => evaluateSingleCondition(condition, context));

  const passed = conditionLogic === "AND"
    ? results.every((r) => r.passed)
    : results.some((r) => r.passed);

  return { passed, results };
}
