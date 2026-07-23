import { ObjectId } from "mongodb";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { claimDueJobs, completeJob, failJob } from "@/lib/services/job-service";
import { processSessionJob } from "@/lib/automation/sessionManager";
import { processBulkCampaign } from "@/lib/services/bulk-message-service";
import { reprocessEvolutionWebhookEvent } from "@/lib/evolution/webhook";
import { executeAutomationResume } from "@/lib/automation/actionExecutor";

async function runDueJobs() {
  const jobs = await claimDueJobs(25);
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const id = String(job._id);
    const type = String(job.type);
    const payload = (job.payload || {}) as Record<string, unknown>;
    try {
      if (type === "session_nudge" || type === "session_close") {
        await processSessionJob(type, payload);
      } else if (type === "webhook_retry") {
        const eventId = String(payload.eventId || "");
        if (!ObjectId.isValid(eventId)) throw new Error("Invalid webhook event id");
        await reprocessEvolutionWebhookEvent(eventId);
      } else if (type === "bulk_campaign_send") {
        await processBulkCampaign(String(payload.campaignId || ""));
      } else if (type === "automation_resume") {
        await executeAutomationResume(payload);
      } else {
        throw new Error(`Unsupported job type: ${type}`);
      }
      await completeJob(id);
      completed += 1;
    } catch (error) {
      await failJob(id, error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  return { claimed: jobs.length, completed, failed };
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return fail("CRON_SECRET is not configured", 500);
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return fail("Unauthorized", 401);
    }
    return ok(await runDueJobs(), "Job worker run complete");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Job worker failed", 400);
  }
}

export async function POST() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    if (user.role !== "super_admin" && user.role !== "admin") return fail("Forbidden", 403);

    return ok(await runDueJobs(), "Job worker run complete");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Job worker failed", 400);
  }
}
