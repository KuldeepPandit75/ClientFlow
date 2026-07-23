import type { ObjectId } from "mongodb";

/* ────── Trigger types ────── */
export type AutomationTriggerType =
  | "new_message_received"
  | "new_customer_created"
  | "first_message_from_customer"
  | "keyword_matched"
  | "customer_status_changed"
  | "customer_assigned"
  | "no_reply_after_delay";

/* ────── Condition types ────── */
export type AutomationConditionType =
  | "message_contains"
  | "message_equals"
  | "customer_is_new"
  | "customer_has_tag"
  | "customer_status_is"
  | "customer_assigned_to"
  | "customer_unassigned"
  | "message_type_is"
  | "business_hours"
  | "ai_intent_is";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists";

export type ConditionLogic = "AND" | "OR";

/* ────── Action types ────── */
export type AutomationActionType =
  | "send_text_message"
  | "send_ai_reply"
  | "assign_agent"
  | "assign_round_robin"
  | "add_tag"
  | "remove_tag"
  | "update_customer_status"
  | "create_internal_note"
  | "notify_admin"
  | "notify_agent"
  | "stop_automation"
  | "wait_delay";

/* ────── Automation status ────── */
export type AutomationStatus = "active" | "inactive" | "draft";
export type AutomationMode = "rules" | "ai_agent";

/* ────── Automation run status ────── */
export type AutomationRunStatus = "success" | "failed" | "skipped" | "running";

/* ────── Message source (anti-loop) ────── */
export type MessageSource = "customer" | "manual" | "automation" | "ai";

/* ────── Sub-documents ────── */
export interface AutomationTrigger {
  type: AutomationTriggerType;
  config: Record<string, unknown>;
}

export interface AutomationCondition {
  id: string;
  type: AutomationConditionType;
  operator: ConditionOperator;
  value: unknown;
  field?: string;
  config: Record<string, unknown>;
}

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  order: number;
  config: Record<string, unknown>;
  continueOnError?: boolean;
}

export interface AutomationStats {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  skippedRuns: number;
  lastRunAt: Date | null;
}

/* ────── MongoDB documents ────── */
export interface AutomationDocument {
  _id: ObjectId;
  businessId: ObjectId;
  createdByUserId: ObjectId;
  name: string;
  description: string;
  accountKey: string;
  mode: AutomationMode;
  status: AutomationStatus;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  conditionLogic: ConditionLogic;
  actions: AutomationAction[];
  stats: AutomationStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationRunDocument {
  _id?: ObjectId;
  businessId: ObjectId;
  automationId: ObjectId;
  automationName: string;
  customerId: string;
  customerName?: string;
  messageId?: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  conditionResults: Array<{
    conditionId: string;
    type: AutomationConditionType;
    passed: boolean;
    reason?: string;
  }>;
  actionResults: Array<{
    actionId: string;
    type: AutomationActionType;
    status: "success" | "failed" | "skipped";
    result?: unknown;
    error?: string;
  }>;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
}

export interface AutomationTemplateDocument {
  _id?: ObjectId;
  name: string;
  category: string;
  description: string;
  accountKey?: string;
  mode?: AutomationMode;
  setupSteps?: string[];
  editablePlaceholders?: Array<{ key: string; description: string; example: string }>;
  exampleConversation?: { customer: string; assistant: string };
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  conditionLogic: ConditionLogic;
  actions: AutomationAction[];
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ────── Engine context ────── */
export interface AutomationContext {
  businessId: string;
  triggerType: AutomationTriggerType;
  customer: {
    customerId: string;
    customerName: string;
    phone: string;
    assignedAgentId?: string | null;
    tags?: string[];
    status?: string;
    isFirstMessage?: boolean;
    firstMessageAt?: Date | null;
    lastMessageAt?: Date | null;
    lastIncomingMessageAt?: Date | null;
    lastOutgoingMessageAt?: Date | null;
    automationPaused?: boolean;
    messageCount?: number;
  };
  message?: {
    id: string;
    text: string;
    direction: "incoming" | "outgoing";
    messageType: string;
    source: MessageSource;
    senderType?: string;
    automationId?: string | null;
  };
  metadata?: Record<string, unknown>;
}

export interface AutomationSessionMetadata {
  version: number;
  isNewSession: boolean;
  previousStatus?: "active" | "closed" | null;
}

/* ────── Serialized response shapes ────── */
export interface AutomationListItem {
  id: string;
  name: string;
  description: string;
  accountKey: string;
  mode: AutomationMode;
  status: AutomationStatus;
  triggerType: AutomationTriggerType;
  conditionCount: number;
  actionCount: number;
  stats: AutomationStats;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationDetail extends AutomationListItem {
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  conditionLogic: ConditionLogic;
  actions: AutomationAction[];
  createdByUserId: string;
  businessId: string;
}

export interface AutomationRunListItem {
  id: string;
  automationId: string;
  automationName: string;
  customerId: string;
  customerName?: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  actionCount: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
}
