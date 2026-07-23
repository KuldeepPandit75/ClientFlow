import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { canManageTemplates } from "@/lib/permissions";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { BUSINESS_MESSAGE_PRESETS, COMMON_TEMPLATE_PLACEHOLDERS } from "@/lib/templates/business-message-presets";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    if (!canManageTemplates(user)) return fail("Forbidden", 403);
    return ok({ presets: BUSINESS_MESSAGE_PRESETS, placeholders: COMMON_TEMPLATE_PLACEHOLDERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template presets could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
