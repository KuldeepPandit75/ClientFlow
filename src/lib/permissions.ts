import type { MemberPermission, SessionUser } from "@/lib/backend/types";

export const GRANTABLE_MEMBER_PERMISSIONS: Array<{
  key: MemberPermission;
  label: string;
  description: string;
}> = [
  { key: "chat.view_all", label: "View all chats", description: "View every workspace chat, not only assigned chats." },
  { key: "chat.view_unassigned", label: "View unassigned chats", description: "View chats that are not assigned yet." },
  { key: "chat.assign", label: "Assign chats", description: "Assign and reassign chats to team members." },
  { key: "template.manage", label: "Manage templates", description: "Create and manage local message templates." },
  { key: "automation.manage", label: "Manage automation", description: "Create, edit, activate, and inspect automations." },
  { key: "knowledge.manage", label: "Manage knowledge", description: "Manage the workspace AI knowledge base." },
  { key: "bulk.send", label: "Send campaigns", description: "Create and send bulk campaigns." },
  { key: "analytics.view", label: "View analytics", description: "View workspace reports and usage." },
  { key: "team.manage", label: "Manage team", description: "Invite and manage subordinate members." },
];

const GRANTABLE_KEYS = new Set(GRANTABLE_MEMBER_PERMISSIONS.map((item) => item.key));

export function normalizeMemberPermissions(value: unknown): MemberPermission[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is MemberPermission =>
    typeof item === "string" && GRANTABLE_KEYS.has(item as MemberPermission),
  )));
}

export function hasPermission(
  user: Pick<SessionUser, "role" | "status"> & { permissions?: MemberPermission[] } | null | undefined,
  permission: MemberPermission,
) {
  if (!user || user.status !== "active") return false;
  if (user.role === "admin") return true;
  return user.role === "sub_agent" && Boolean(user.permissions?.includes(permission));
}

type CustomerLike = {
  businessId?: unknown;
  assignedAgentId?: unknown;
};

function idOf(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value) return value.toString();
  return null;
}

export function canManagePlatform(user: Pick<SessionUser, "role"> | null | undefined) {
  return user?.role === "super_admin";
}

export function canManageTeam(user: Pick<SessionUser, "role" | "status"> | null | undefined) {
  return hasPermission(user, "team.manage");
}

export function canConnectWhatsapp(user: Pick<SessionUser, "role" | "status"> | null | undefined) {
  return user?.role === "admin" && user.status === "active";
}

export function canViewCustomer(
  user: Pick<SessionUser, "id" | "role" | "businessId" | "status"> | null | undefined,
  customer: CustomerLike | null | undefined,
) {
  if (!user || !customer || user.status !== "active") return false;
  if (user.role === "super_admin") return true;

  const customerBusinessId = idOf(customer.businessId);
  if (!user.businessId || customerBusinessId !== user.businessId) return false;
  if (user.role === "admin" || hasPermission(user as SessionUser, "chat.view_all")) return true;
  if (user.role === "sub_agent") {
    if (!customer.assignedAgentId && hasPermission(user as SessionUser, "chat.view_unassigned")) return true;
    return idOf(customer.assignedAgentId) === user.id;
  }
  return false;
}

export function canAssignCustomer(
  user: Pick<SessionUser, "role" | "businessId" | "status"> | null | undefined,
  customer: CustomerLike | null | undefined,
) {
  if (!user || !customer || !hasPermission(user as SessionUser, "chat.assign")) return false;
  return Boolean(user.businessId) && idOf(customer.businessId) === user.businessId;
}

export function canSendMessage(
  user: Pick<SessionUser, "id" | "role" | "businessId" | "status"> | null | undefined,
  customer: CustomerLike | null | undefined,
) {
  return canViewCustomer(user, customer) && user?.role !== "super_admin";
}

export const canManageTemplates = (user: SessionUser | null | undefined) => hasPermission(user, "template.manage");
export const canManageAutomations = (user: SessionUser | null | undefined) => hasPermission(user, "automation.manage");
export const canManageKnowledge = (user: SessionUser | null | undefined) => hasPermission(user, "knowledge.manage");
export const canSendBulk = (user: SessionUser | null | undefined) => hasPermission(user, "bulk.send");
export const canViewAnalytics = (user: SessionUser | null | undefined) => hasPermission(user, "analytics.view");
