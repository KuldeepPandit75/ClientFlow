import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { listTeam } from "@/lib/services/team-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    return ok(await listTeam(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Team could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
