import { requireSessionEmail } from "@/lib/auth/session";
import { ok } from "@/lib/backend/response";
import { listConversations } from "@/lib/services/conversation-service";

export async function GET(request: Request) {
  const userEmail = await requireSessionEmail();
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("cursor") || "1");
  const limit = Number(url.searchParams.get("limit") || "15");
  const assigned = (url.searchParams.get("assigned") || "any") as "me" | "unassigned" | "any";
  const status = (url.searchParams.get("status") || "any") as "open" | "closed" | "pending" | "any";
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const accountKey = url.searchParams.get("accountKey") || undefined;
  const q = url.searchParams.get("q") || undefined;
  return ok(await listConversations(userEmail, page, limit, {
    assigned,
    status,
    unreadOnly,
    accountKey,
    q,
  }));
}
