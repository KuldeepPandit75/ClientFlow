import { ObjectId } from "mongodb";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { getDb } from "@/lib/db/mongodb";
import { enqueueJob } from "@/lib/services/job-service";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    if (user.role !== "admin" && user.role !== "super_admin") return fail("Forbidden", 403);

    const body = await request.json().catch(() => ({}));
    const eventId = String(body?.eventId || "");
    const db = await getDb();

    if (eventId) {
      if (!ObjectId.isValid(eventId)) return fail("Invalid eventId", 400);
      const result = await db.collection("webhook_events").findOneAndUpdate(
        { _id: new ObjectId(eventId), status: "failed" },
        { $set: { status: "retry_queued", queuedAt: new Date(), updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      if (!result) return fail("Failed event not found", 404);
      await enqueueJob({
        type: "webhook_retry",
        runAt: new Date(),
        payload: { eventId },
        dedupeKey: `webhook_retry:${eventId}`,
      });
      return ok({ queued: 1 }, "Retry queued");
    }

    const failedEvents = await db.collection("webhook_events")
      .find({ status: "failed" })
      .project({ _id: 1 })
      .limit(500)
      .toArray();
    const result = await db.collection("webhook_events").updateMany(
      { status: "failed" },
      { $set: { status: "retry_queued", queuedAt: new Date(), updatedAt: new Date() } },
    );
    for (const event of failedEvents) {
      await enqueueJob({
        type: "webhook_retry",
        runAt: new Date(),
        payload: { eventId: event._id.toString() },
        dedupeKey: `webhook_retry:${event._id.toString()}`,
      });
    }
    return ok({ queued: result.modifiedCount }, "Retries queued");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Retry queue failed", 400);
  }
}
