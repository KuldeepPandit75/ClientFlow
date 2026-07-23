import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { rotateWhatsappSessionEncryption } from "@/lib/services/security-service";

export async function POST() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    if (user.role !== "super_admin") return fail("Forbidden", 403);
    return ok(await rotateWhatsappSessionEncryption(), "Encryption rotation complete");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Rotation failed", 400);
  }
}
