import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { inviteAgent, resendAgentInvite, revokeAgentInvite } from "@/lib/services/team-service";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    return ok(await inviteAgent(user, body, appUrl), "Agent invite created", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invite could not be created";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const action = String(body?.action || "").trim();
    const inviteId = String(body?.inviteId || "").trim();
    if (!inviteId) return fail("inviteId is required", 400);
    if (action !== "resend") return fail("Unsupported action", 400);
    return ok(await resendAgentInvite(user, inviteId, appUrl), "Agent invite resent");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invite could not be updated";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const url = new URL(request.url);
    const inviteId = String(url.searchParams.get("inviteId") || "");
    if (!inviteId) return fail("inviteId is required", 400);
    return ok(await revokeAgentInvite(user, inviteId), "Agent invite revoked");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invite could not be revoked";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
