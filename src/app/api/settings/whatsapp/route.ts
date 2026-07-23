import { requireSessionEmail } from "@/lib/auth/session";
import { ok } from "@/lib/backend/response";
import { getWhatsAppSettings } from "@/lib/services/settings-service";

export async function GET() {
  const userEmail = await requireSessionEmail();
  return ok(await getWhatsAppSettings(userEmail));
}
