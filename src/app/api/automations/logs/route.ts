import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/services/auth-service";
import { listAutomationRuns } from "@/lib/automation/automationLogger";

export async function GET(request: Request) {
  try {
    const email = await requireSessionEmail();
    const user = await getCurrentUser(email);
    if (!user || user.role !== "admin" || !user.businessId) {
      return fail("Forbidden", 403);
    }

    const url = new URL(request.url);
    const automationId = url.searchParams.get("automationId") || undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const skip = Math.max(Number(url.searchParams.get("skip") || 0), 0);

    const result = await listAutomationRuns(user.businessId, {
      automationId,
      limit,
      skip,
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to list logs", 400);
  }
}
