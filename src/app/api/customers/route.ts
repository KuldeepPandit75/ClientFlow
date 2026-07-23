import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { createCustomerFromChat, createManualCustomer, listCustomers } from "@/lib/services/conversation-service";

export async function GET() {
  try {
    const userEmail = await requireSessionEmail();
    return ok(await listCustomers(userEmail));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customers could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const userEmail = await requireSessionEmail();
    const body = await request.json();
    const customer = body.chatId
      ? await createCustomerFromChat(userEmail, body)
      : await createManualCustomer(userEmail, body);
    return ok(customer, "Customer saved", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer could not be created";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
