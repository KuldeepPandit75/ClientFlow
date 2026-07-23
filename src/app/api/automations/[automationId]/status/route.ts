import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import { updateAutomationStatus } from "@/lib/services/automation-service";

interface RouteParams {
  params: Promise<{ automationId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { automationId } = await params;
    const email = await requireSessionEmail();
    const body = await request.json();

    if (!body.status || !["active", "inactive", "draft"].includes(body.status)) {
      return fail("Invalid status. Must be active, inactive, or draft.", 400);
    }

    const automation = await updateAutomationStatus(email, automationId, body.status);
    if (!automation) return fail("Automation not found", 404);
    return ok(automation);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update status", 400);
  }
}
