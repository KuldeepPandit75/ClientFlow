import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { createMessageTemplate, listMessageTemplates } from "@/lib/services/message-template-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    return ok(await listMessageTemplates(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list templates";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await createMessageTemplate(user, body), "Template created", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create template";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
