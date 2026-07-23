import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { createKnowledgeDocument, listKnowledgeDocuments } from "@/lib/services/knowledge-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    return ok(await listKnowledgeDocuments(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load knowledge docs";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await createKnowledgeDocument(user, body), "Knowledge document created", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create knowledge doc";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
