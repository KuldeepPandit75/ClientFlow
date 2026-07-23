import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { refreshEvolutionWhatsApp } from "@/lib/services/settings-service";

export async function GET(request: Request) {
  try {
    const userEmail = await requireSessionEmail();
    const url = new URL(request.url);
    const accountKey = url.searchParams.get("accountKey") || undefined;
    return ok(await refreshEvolutionWhatsApp(userEmail, accountKey), "Evolution API status refreshed");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Evolution API status failed", 502);
  }
}
