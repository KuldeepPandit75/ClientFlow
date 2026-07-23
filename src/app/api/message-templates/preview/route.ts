import { fail, ok } from "@/lib/backend/response";
import { previewMessageTemplate } from "@/lib/services/message-template-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return ok({ preview: previewMessageTemplate(body) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to preview template", 400);
  }
}
