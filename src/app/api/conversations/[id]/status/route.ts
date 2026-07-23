import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { updateConversationStatus } from "@/lib/services/conversation-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const body = await request.json();
  if (!body.status) return fail("status is required");
  const conversation = await updateConversationStatus(userEmail, id, body.status);
  if (!conversation) return fail("Conversation not found", 404);
  return ok(conversation, "Conversation status updated");
}
