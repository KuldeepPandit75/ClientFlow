import { ok, fail } from "@/lib/backend/response";
import { listTemplates } from "@/lib/automation/defaultTemplates";

export async function GET() {
  try {
    const templates = await listTemplates();
    return ok(templates);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to list templates", 400);
  }
}
