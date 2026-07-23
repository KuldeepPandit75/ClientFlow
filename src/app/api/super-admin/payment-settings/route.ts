import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { getPaymentSettings, updatePaymentSettings } from "@/lib/services/platform-service";

export async function GET() {
  try {
    return ok(await getPaymentSettings(await requireCurrentUser(await requireSessionEmail())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment settings could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await updatePaymentSettings(user, {
      keyId: body?.keyId,
      keySecret: body?.keySecret,
    }), "Payment settings updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment settings could not be updated";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
