import { ObjectId } from "mongodb";
import { requireSessionEmail } from "@/lib/auth/session";
import { fail, ok } from "@/lib/backend/response";
import { getDb } from "@/lib/db/mongodb";
import { requireCurrentUser } from "@/lib/services/auth-service";

export async function GET() {
  try {
    const user = await requireCurrentUser(await requireSessionEmail());
    const db = await getDb();
    const business = user.businessId
      ? await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) })
      : null;
    const owner = business?.ownerUserId
      ? await db.collection("users").findOne({ _id: business.ownerUserId })
      : null;
    const [assignedCustomers, totalAgents] = user.businessId
      ? await Promise.all([
          user.role === "sub_agent" && ObjectId.isValid(user.id)
            ? db.collection("customers").countDocuments({ businessId: new ObjectId(user.businessId), assignedAgentId: new ObjectId(user.id) })
            : Promise.resolve(0),
          db.collection("users").countDocuments({ businessId: new ObjectId(user.businessId), role: "sub_agent" }),
        ])
      : [0, 0];

    return ok({
      user,
      business: business
        ? {
            id: business._id.toString(),
            name: business.name,
            plan: business.plan,
            status: business.status,
            ownerName: owner?.name || null,
            ownerEmail: owner?.email || null,
            createdAt: business.createdAt,
          }
        : null,
      stats: {
        assignedCustomers,
        totalAgents,
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Profile could not be loaded", 400);
  }
}
