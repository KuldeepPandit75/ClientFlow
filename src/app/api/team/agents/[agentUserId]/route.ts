import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { removeAgent, updateAgentStatus } from "@/lib/services/team-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ agentUserId: string }> },
) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { agentUserId } = await params;
    const body = await request.json();
    const status = body.status === "active" || body.status === "disabled" ? body.status : undefined;
    const permissions = Array.isArray(body.permissions) ? body.permissions : undefined;
    if (!status && !permissions) return fail("status or permissions are required");
    return ok(await updateAgentStatus(user, agentUserId, status, permissions), "Agent updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent could not be updated";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agentUserId: string }> },
) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { agentUserId } = await params;
    return ok(await removeAgent(user, agentUserId), "Agent removed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent could not be removed";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
