import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { listPlatformAdmins } from "@/lib/services/platform-service";

export async function GET() {
  try {
    return ok(await listPlatformAdmins(await requireCurrentUser(await requireSessionEmail())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admins could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
