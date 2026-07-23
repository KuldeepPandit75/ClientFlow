import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { assignCustomerToAgent } from "@/lib/services/conversation-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const userEmail = await requireSessionEmail();
    const { customerId } = await params;
    const body = await request.json();
    const conversation = await assignCustomerToAgent(userEmail, customerId, body.agentUserId || null);
    if (!conversation) return fail("Customer not found", 404);
    return ok(conversation, "Customer assigned");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer could not be assigned";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
