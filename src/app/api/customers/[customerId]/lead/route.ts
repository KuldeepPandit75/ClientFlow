import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { updateCustomerLead } from "@/lib/services/conversation-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const userEmail = await requireSessionEmail();
    const body = await request.json();
    const { customerId } = await params;
    const result = await updateCustomerLead(userEmail, customerId, body);
    if (!result) return fail("Customer not found", 404);
    return ok(result, "Customer lead updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer lead update failed";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
