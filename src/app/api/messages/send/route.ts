import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { sendMediaMessage, sendMessage } from "@/lib/services/conversation-service";

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const userEmail = await requireSessionEmail();
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const conversationId = String(form.get("conversationId") || "");
    const content = String(form.get("content") || "");
    const senderName = String(form.get("senderName") || "");
    const file = form.get("file");

    if (!conversationId || !(file instanceof File)) {
      return fail("conversationId and file are required");
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return fail("Attachment must be 20MB or smaller", 413);
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const message = await sendMediaMessage({
        userEmail,
        conversationId,
        content,
        senderName,
        fileName: file.name || "attachment",
        mimetype: file.type || "application/octet-stream",
        base64: buffer.toString("base64"),
      });
      if (!message) return fail("Conversation not found", 404);
      return ok(message, "Attachment sent", 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Attachment could not be sent";
      return fail(message, message === "Forbidden" ? 403 : 502);
    }
  }

  const body = await request.json();
  if (!body.conversationId || !body.content) {
    return fail("conversationId and content are required");
  }

  try {
    const message = await sendMessage({ ...body, userEmail });
    if (!message) return fail("Conversation not found", 404);
    return ok(message, "Message sent", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be sent";
    return fail(message, message === "Forbidden" ? 403 : 502);
  }
}
