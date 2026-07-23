import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import {
  getAutomation,
  updateAutomation,
  deleteAutomation,
} from "@/lib/services/automation-service";

interface RouteParams {
  params: Promise<{ automationId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { automationId } = await params;
    const email = await requireSessionEmail();
    const automation = await getAutomation(email, automationId);
    if (!automation) return fail("Automation not found", 404);
    return ok(automation);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to get automation", 400);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { automationId } = await params;
    const email = await requireSessionEmail();
    const body = await request.json();
    const automation = await updateAutomation(email, automationId, body);
    if (!automation) return fail("Automation not found", 404);
    return ok(automation);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update automation", 400);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { automationId } = await params;
    const email = await requireSessionEmail();
    const deleted = await deleteAutomation(email, automationId);
    if (!deleted) return fail("Automation not found", 404);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to delete automation", 400);
  }
}
