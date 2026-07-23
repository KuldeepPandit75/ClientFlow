import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { createPlanOrder } from "@/lib/services/billing-service";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await createPlanOrder(user, {
      plan: body?.plan,
      couponCode: body?.couponCode,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan change could not be started";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
