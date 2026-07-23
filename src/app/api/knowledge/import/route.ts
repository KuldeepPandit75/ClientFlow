import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { importKnowledgeDocumentFromTextFile } from "@/lib/services/knowledge-service";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const formData = await request.formData();
    const file = formData.get("file");
    const tagsRaw = String(formData.get("tags") || "");
    if (!(file instanceof File)) return fail("file is required", 400);
    if (file.size > MAX_SIZE_BYTES) return fail("file must be 2MB or smaller", 413);
    const mime = file.type || "text/plain";
    if (!mime.includes("text") && mime !== "application/json") {
      return fail("Only text or JSON files are supported right now", 400);
    }
    const content = await file.text();
    if (!content.trim()) return fail("Uploaded file is empty", 400);

    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const created = await importKnowledgeDocumentFromTextFile(user, {
      fileName: file.name || "knowledge-upload.txt",
      content,
      tags,
    });

    return ok(created, "Knowledge file imported", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import knowledge file";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
