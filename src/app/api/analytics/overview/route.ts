import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { getAnalyticsOverview } from "@/lib/services/analytics-service";

export async function GET() {
  try {
    const userEmail = await requireSessionEmail();
    return ok(await getAnalyticsOverview(userEmail));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load analytics", 400);
  }
}
