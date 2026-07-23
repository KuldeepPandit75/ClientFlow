import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { verifyPlanPayment } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await verifyPlanPayment(user, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment could not be verified";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
