import { requireSessionEmail } from "@/lib/auth/session";
import { ok } from "@/lib/backend/response";
import { getConversationMessages } from "@/lib/services/conversation-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userEmail = await requireSessionEmail();
  const { id } = await params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("cursor") || "1");
  const limit = Number(url.searchParams.get("limit") || "15");
  try {
    return ok(await getConversationMessages(userEmail, id, page, limit));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Messages could not be loaded";
    return Response.json({ success: false, message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}
