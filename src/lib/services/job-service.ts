import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";

export type JobType = "session_nudge" | "session_close" | "webhook_retry" | "bulk_campaign_send" | "automation_resume";

export async function enqueueJob(input: {
  type: JobType;
  businessId?: string;
  runAt: Date;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}) {
  const db = await getDb();
  if (input.dedupeKey) {
    const existing = await db.collection("jobs").findOne({
      dedupeKey: input.dedupeKey,
      status: { $in: ["queued", "running"] },
    });
    if (existing) return { id: existing._id.toString(), deduped: true };
  }

  const doc = {
    type: input.type,
    businessId: input.businessId && ObjectId.isValid(input.businessId)
      ? new ObjectId(input.businessId)
      : null,
    payload: input.payload,
    runAt: input.runAt,
    status: "queued",
    attempts: 0,
    maxAttempts: 5,
    dedupeKey: input.dedupeKey || null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection("jobs").insertOne(doc);
  return { id: result.insertedId.toString(), deduped: false };
}

export async function claimDueJobs(limit = 20) {
  const db = await getDb();
  const now = new Date();
  const due = await db.collection("jobs")
    .find({ status: "queued", runAt: { $lte: now } })
    .sort({ runAt: 1, createdAt: 1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .toArray();

  const claimed: Array<Record<string, unknown>> = [];
  for (const job of due) {
    const res = await db.collection("jobs").findOneAndUpdate(
      { _id: job._id, status: "queued" },
      {
        $set: { status: "running", startedAt: new Date(), updatedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" },
    );
    if (res) claimed.push(res as unknown as Record<string, unknown>);
  }
  return claimed;
}

export async function completeJob(jobId: string) {
  if (!ObjectId.isValid(jobId)) return;
  const db = await getDb();
  await db.collection("jobs").updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: "completed", completedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function failJob(jobId: string, error: string) {
  if (!ObjectId.isValid(jobId)) return;
  const db = await getDb();
  const job = await db.collection("jobs").findOne({ _id: new ObjectId(jobId) });
  const attempts = Number((job as Record<string, unknown> | null)?.attempts || 1);
  const maxAttempts = Number((job as Record<string, unknown> | null)?.maxAttempts || 5);
  const shouldRetry = attempts < maxAttempts;
  const backoffMinutes = Math.min(30, attempts * 2);

  await db.collection("jobs").updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        status: shouldRetry ? "queued" : "failed",
        runAt: shouldRetry ? new Date(Date.now() + backoffMinutes * 60_000) : new Date(),
        lastError: error,
        updatedAt: new Date(),
      },
    },
  );
}
