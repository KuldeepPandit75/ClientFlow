import { requireSessionEmail } from "@/lib/auth/session";
import { ok } from "@/lib/backend/response";
import { testWhatsAppConnection } from "@/lib/services/settings-service";

export async function POST(request: Request) {
  const userEmail = await requireSessionEmail();
  const body = await request.json().catch(() => ({}));
  const accountKey = typeof body?.accountKey === "string" ? body.accountKey : undefined;
  return ok(await testWhatsAppConnection(userEmail, accountKey), "WhatsApp connection tested");
}
