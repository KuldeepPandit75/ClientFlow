import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { deleteKnowledgeDocument, updateKnowledgeDocument } from "@/lib/services/knowledge-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    const { documentId } = await params;
    return ok(await updateKnowledgeDocument(user, documentId, body), "Knowledge document updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update knowledge doc";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { documentId } = await params;
    return ok(await deleteKnowledgeDocument(user, documentId), "Knowledge document deleted");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete knowledge doc";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
