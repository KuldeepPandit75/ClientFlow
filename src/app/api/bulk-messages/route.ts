import { requireCurrentUser } from "@/lib/services/auth-service";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { createBulkCampaign, listBulkCampaigns } from "@/lib/services/bulk-message-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    return ok(await listBulkCampaigns(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list bulk campaigns";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const body = await request.json();
    return ok(await createBulkCampaign(user, body), "Bulk campaign created", 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create bulk campaign";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
