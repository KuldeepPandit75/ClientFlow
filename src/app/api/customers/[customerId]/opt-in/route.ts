import { ObjectId } from "mongodb";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { getCurrentUser } from "@/lib/services/auth-service";
import { updateCustomerOptIn } from "@/lib/services/compliance-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const user = await getCurrentUser(await requireSessionEmail());
    if (!user || user.role !== "admin" || !user.businessId) return fail("Forbidden", 403);
    if (!ObjectId.isValid(user.businessId)) return fail("Invalid business", 400);

    const body = await request.json();
    const { customerId } = await params;
    const optIn = body?.optIn === true;
    return ok(await updateCustomerOptIn({ businessId: user.businessId, customerId, optIn }), "Customer opt-in updated");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update opt-in", 400);
  }
}
