import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { disconnectWhatsApp } from "@/lib/services/settings-service";

export async function POST(request: Request) {
  try {
    const userEmail = await requireSessionEmail();
    const body = await request.json().catch(() => ({}));
    const accountKey = typeof body?.accountKey === "string" ? body.accountKey : undefined;
    return ok(await disconnectWhatsApp(userEmail, accountKey), "Evolution API disconnected");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Evolution API disconnect failed", 502);
  }
}
