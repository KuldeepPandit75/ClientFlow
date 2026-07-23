import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { getBilling } from "@/lib/services/billing-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    return ok(await getBilling(user));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Billing could not be loaded", 400);
  }
}
