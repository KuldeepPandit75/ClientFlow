import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { deleteMessageTemplate, updateMessageTemplateStatus } from "@/lib/services/message-template-service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { templateId } = await params;
    return ok(await deleteMessageTemplate(user, templateId), "Template deleted");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete template";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { templateId } = await params;
    const body = await request.json();
    const status = body?.status as "draft" | "ready" | "disabled";
    if (!["draft", "ready", "disabled"].includes(status)) return fail("Invalid status", 400);
    return ok(await updateMessageTemplateStatus(user, templateId, status), "Template status updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update template";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
