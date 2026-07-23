import { ok, fail } from "@/lib/backend/response";
import { requireSessionEmail } from "@/lib/auth/session";
import {
  listAutomations,
  createAutomation,
} from "@/lib/services/automation-service";

export async function GET() {
  try {
    const email = await requireSessionEmail();
    const automations = await listAutomations(email);
    return ok(automations);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to list automations", 400);
  }
}

export async function POST(request: Request) {
  try {
    const email = await requireSessionEmail();
    const body = await request.json();
    const automation = await createAutomation(email, body);
    return ok(automation, "Automation created", 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to create automation", 400);
  }
}
