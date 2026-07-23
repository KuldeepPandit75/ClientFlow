import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { listWhatsAppAccounts } from "@/lib/services/settings-service";

export async function GET() {
  try {
    const userEmail = await requireSessionEmail();
    return ok(await listWhatsAppAccounts(userEmail), "WhatsApp accounts fetched");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load WhatsApp accounts", 400);
  }
}
