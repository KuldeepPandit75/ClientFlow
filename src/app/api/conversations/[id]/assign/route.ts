import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { assignConversation } from "@/lib/services/conversation-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const body = await request.json();
  const agentUserId = body.agentUserId ?? body.assignedAgent ?? null;
  const conversation = await assignConversation(userEmail, id, agentUserId);
  if (!conversation) return fail("Conversation not found", 404);
  return ok(conversation, "Conversation assigned");
}
