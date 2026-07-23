import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import type {
  AutomationRunDocument,
  AutomationRunStatus,
  AutomationConditionType,
  AutomationActionType,
  AutomationTriggerType,
} from "@/lib/automation/types";

let indexesCreated = false;

async function ensureIndexes() {
  if (indexesCreated) return;
  const db = await getDb();
  await Promise.all([
    db.collection("automation_runs").createIndex(
      { businessId: 1, createdAt: -1 },
      { name: "automation_runs_business_time" },
    ),
    db.collection("automation_runs").createIndex(
      { automationId: 1, createdAt: -1 },
      { name: "automation_runs_automation_time" },
    ),
    db.collection("automations").createIndex(
      { businessId: 1, status: 1 },
      { name: "automations_business_status" },
    ),
    db.collection("automations").createIndex(
      { businessId: 1, "trigger.type": 1, status: 1 },
      { name: "automations_business_trigger" },
    ),
    db.collection("automation_templates").createIndex(
      { isSystemTemplate: 1 },
      { name: "automation_templates_system" },
    ),
  ]);
  indexesCreated = true;
}

export async function createAutomationRun(input: {
  businessId: string;
  automationId: string;
  automationName: string;
  customerId: string;
  customerName?: string;
  messageId?: string;
  triggerType: AutomationTriggerType;
}): Promise<string> {
  await ensureIndexes();
  const db = await getDb();
  const now = new Date();

  const doc: AutomationRunDocument = {
    businessId: new ObjectId(input.businessId),
    automationId: new ObjectId(input.automationId),
    automationName: input.automationName,
    customerId: input.customerId,
    customerName: input.customerName,
    messageId: input.messageId,
    triggerType: input.triggerType,
    status: "running",
    conditionResults: [],
    actionResults: [],
    startedAt: now,
    createdAt: now,
  };

  const result = await db.collection("automation_runs").insertOne(doc);
  return result.insertedId.toString();
}

export async function updateAutomationRun(
  runId: string,
  updates: {
    status?: AutomationRunStatus;
    conditionResults?: Array<{
      conditionId: string;
      type: AutomationConditionType;
      passed: boolean;
      reason?: string;
    }>;
    actionResults?: Array<{
      actionId: string;
      type: AutomationActionType;
      status: "success" | "failed" | "skipped";
      result?: unknown;
      error?: string;
    }>;
    error?: string;
  },
) {
  const db = await getDb();
  const setFields: Record<string, unknown> = {};

  if (updates.status) setFields.status = updates.status;
  if (updates.conditionResults) setFields.conditionResults = updates.conditionResults;
  if (updates.actionResults) setFields.actionResults = updates.actionResults;
  if (updates.error) setFields.error = updates.error;
  if (updates.status && updates.status !== "running") setFields.finishedAt = new Date();

  if (Object.keys(setFields).length) {
    await db.collection("automation_runs").updateOne(
      { _id: new ObjectId(runId) },
      { $set: setFields },
    );
  }
}

export async function updateAutomationStats(
  automationId: string,
  result: "success" | "failed" | "skipped",
) {
  const db = await getDb();
  const inc: Record<string, number> = { "stats.totalRuns": 1 };

  if (result === "success") inc["stats.successRuns"] = 1;
  else if (result === "failed") inc["stats.failedRuns"] = 1;
  else if (result === "skipped") inc["stats.skippedRuns"] = 1;

  await db.collection("automations").updateOne(
    { _id: new ObjectId(automationId) },
    {
      $inc: inc,
      $set: { "stats.lastRunAt": new Date() },
    },
  );
}

export async function listAutomationRuns(
  businessId: string,
  options: {
    automationId?: string;
    limit?: number;
    skip?: number;
  } = {},
) {
  await ensureIndexes();
  const db = await getDb();
  const query: Record<string, unknown> = { businessId: new ObjectId(businessId) };
  if (options.automationId) {
    query.automationId = new ObjectId(options.automationId);
  }

  const limit = Math.min(options.limit || 50, 100);
  const skip = options.skip || 0;

  const [runs, total] = await Promise.all([
    db
      .collection<AutomationRunDocument>("automation_runs")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection("automation_runs").countDocuments(query),
  ]);

  return {
    items: runs.map((run) => ({
      id: run._id!.toString(),
      automationId: run.automationId.toString(),
      automationName: run.automationName,
      customerId: run.customerId,
      customerName: run.customerName,
      triggerType: run.triggerType,
      status: run.status,
      actionCount: run.actionResults.length,
      conditionResults: run.conditionResults,
      actionResults: run.actionResults,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      createdAt: run.createdAt.toISOString(),
    })),
    total,
  };
}
