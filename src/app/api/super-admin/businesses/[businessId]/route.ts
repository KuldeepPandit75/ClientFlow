import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { requireCurrentUser } from "@/lib/services/auth-service";
import { getBusinessDetail, updateBusinessStatus } from "@/lib/services/platform-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { businessId } = await params;
    return ok(await getBusinessDetail(user, businessId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Business could not be loaded";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const { businessId } = await params;
    const body = await request.json();
    if (!["active", "suspended", "cancelled"].includes(body.status)) return fail("Invalid status");
    return ok(await updateBusinessStatus(user, businessId, body.status), "Business updated");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Business could not be updated";
    return fail(message, message === "Forbidden" ? 403 : 400);
  }
}
