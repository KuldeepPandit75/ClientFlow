import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { markConversationRead } from "@/lib/services/conversation-service";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const conversation = await markConversationRead(userEmail, id);
  if (!conversation) return fail("Conversation not found", 404);
  return ok(conversation, "Conversation marked as read");
}
