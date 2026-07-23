import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { getSessionFollowUpSettings, updateSessionFollowUpSettings } from "@/lib/services/settings-service";

export async function GET() {
  try {
    const userEmail = await requireSessionEmail();
    return ok(await getSessionFollowUpSettings(userEmail));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load follow-up settings";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const userEmail = await requireSessionEmail();
    const body = await request.json();
    return ok(await updateSessionFollowUpSettings(userEmail, body), "Follow-up settings updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update follow-up settings";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
