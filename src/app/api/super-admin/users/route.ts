import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { listPlatformUsers } from "@/lib/services/platform-service";

export async function GET() {
  try {
    return ok(await listPlatformUsers(await requireCurrentUser(await requireSessionEmail())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Users could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
