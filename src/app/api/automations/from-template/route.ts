import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import { createAutomationFromTemplate } from "@/lib/services/automation-service";

export async function POST(request: Request) {
  try {
    const email = await requireSessionEmail();
    const body = await request.json();

    if (!body.templateId) {
      return fail("templateId is required", 400);
    }

    const automation = await createAutomationFromTemplate(
      email,
      body.templateId,
      { name: body.name, description: body.description },
    );

    if (!automation) return fail("Template not found", 404);
    return ok(automation, "Automation created from template", 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to create from template", 400);
  }
}
