import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import { duplicateAutomation } from "@/lib/services/automation-service";

interface RouteParams {
  params: Promise<{ automationId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { automationId } = await params;
    const email = await requireSessionEmail();
    const automation = await duplicateAutomation(email, automationId);
    if (!automation) return fail("Automation not found", 404);
    return ok(automation, "Automation duplicated", 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to duplicate", 400);
  }
}
