import { getSessionEmail } from "@/lib/auth/session";
import { ok } from "@/lib/backend/response";
import { getCurrentUser } from "@/lib/services/auth-service";

export async function GET() {
  const email = await getSessionEmail();
  return ok(await getCurrentUser(email));
}
