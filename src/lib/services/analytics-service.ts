import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { getCurrentUser } from "@/lib/services/auth-service";
import { canViewAnalytics } from "@/lib/permissions";

export async function getAnalyticsOverview(userEmail: string) {
  const user = await getCurrentUser(userEmail);
  if (!user || !canViewAnalytics(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const businessId = new ObjectId(user.businessId);

  const [customers, openCustomers, closedCustomers, assigned, unassigned, totalMessages, aiMessages, activeAgents, connectedAccounts, bulkCampaigns] = await Promise.all([
    db.collection("customers").countDocuments({ businessId }),
    db.collection("customers").countDocuments({ businessId, status: { $in: ["new", "interested", "open", "active"] } }),
    db.collection("customers").countDocuments({ businessId, status: { $in: ["closed", "won", "lost"] } }),
    db.collection("customers").countDocuments({ businessId, assignedAgentId: { $ne: null } }),
    db.collection("customers").countDocuments({ businessId, assignedAgentId: null }),
    db.collection("messages").countDocuments({ businessId }),
    db.collection("messages").countDocuments({ businessId, aiGenerated: true }),
    db.collection("users").countDocuments({ businessId, role: "sub_agent", status: "active" }),
    db.collection("whatsapp_sessions").countDocuments({ businessId, status: "connected" }),
    db.collection("bulk_campaigns").countDocuments({ businessId }),
  ]);

  const topAgent = await db.collection("customers").aggregate([
    { $match: { businessId, assignedAgentId: { $ne: null } } },
    { $group: { _id: "$assignedAgentId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]).toArray();

  return {
    totalChats: customers,
    openChats: openCustomers,
    closedChats: closedCustomers,
    assignedChats: assigned,
    unassignedChats: unassigned,
    messageVolume: totalMessages,
    aiHandled: aiMessages,
    humanHandled: Math.max(0, totalMessages - aiMessages),
    activeAgents,
    topAgentAssignedCustomers: Number((topAgent[0] as Record<string, unknown> | undefined)?.count || 0),
    bulkCampaigns,
    connectedWhatsappAccounts: connectedAccounts,
  };
}
