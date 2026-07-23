import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { getConversation } from "@/lib/services/conversation-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const conversation = await getConversation(userEmail, id);
  if (!conversation) return fail("Conversation not found", 404);
  return ok(conversation);
}
