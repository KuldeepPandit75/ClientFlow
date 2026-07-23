import { createHash, randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { createAuditLog } from "@/lib/audit";
import type { MemberPermission, SessionUser } from "@/lib/backend/types";
import { getDb } from "@/lib/db/mongodb";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { canManageTeam, normalizeMemberPermissions } from "@/lib/permissions";
import { createSubAgentUser, listBusinessUsers, normalizeEmail } from "@/lib/services/auth-service";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function requireObjectId(value: string, label: string) {
  if (!ObjectId.isValid(value)) throw new Error(`Invalid ${label}`);
  return new ObjectId(value);
}

function serializeInvite(invite: Record<string, any>) {
  return {
    id: invite._id.toString(),
    businessId: invite.businessId?.toString() || null,
    invitedByUserId: invite.invitedByUserId?.toString() || null,
    name: invite.name,
    email: invite.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt || null,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    permissions: normalizeMemberPermissions(invite.permissions),
  };
}

export async function listTeam(user: SessionUser) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const invites = await db.collection("agent_invites")
    .find({ businessId: new ObjectId(user.businessId) })
    .sort({ createdAt: -1 })
    .toArray();

  return {
    agents: await listBusinessUsers(user.businessId, "sub_agent"),
    invites: invites.map(serializeInvite),
  };
}

export async function inviteAgent(user: SessionUser, input: { name: string; email: string; permissions?: MemberPermission[] }, appUrl: string) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const name = input.name?.trim();
  const email = input.email?.trim();
  if (!name || !email) throw new Error("name and email are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");

  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) });
  if (!business) throw new Error("Business workspace was not found");
  if (business.status !== "active") throw new Error("This business is not active");

  const maxAgents = business.limits?.maxAgents ?? PLAN_LIMITS[business.plan as keyof typeof PLAN_LIMITS]?.maxAgents ?? 1;
  const activeAgents = await db.collection("users").countDocuments({
    businessId: new ObjectId(user.businessId),
    role: "sub_agent",
    status: { $ne: "disabled" },
  });
  const pendingInvites = await db.collection("agent_invites").countDocuments({
    businessId: new ObjectId(user.businessId),
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (activeAgents + pendingInvites >= maxAgents) {
    throw new Error("You have reached your plan limit. Upgrade to invite more agents.");
  }

  const token = randomBytes(32).toString("hex");
  const permissions = normalizeMemberPermissions(input.permissions);
  const now = new Date();
  const invite = {
    businessId: new ObjectId(user.businessId),
    invitedByUserId: new ObjectId(user.id),
    name,
    email,
    normalizedEmail: normalizeEmail(email),
    permissions,
    tokenHash: hashToken(token),
    status: "pending",
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
    acceptedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("agent_invites").insertOne(invite);
  await createAuditLog({
    businessId: user.businessId,
    actorUser: user,
    action: "agent.invite",
    targetType: "agent_invite",
    targetId: result.insertedId,
    metadata: { email },
  });

  return {
    invite: serializeInvite({ ...invite, _id: result.insertedId }),
    inviteLink: `${appUrl.replace(/\/+$/, "")}/invite/accept?token=${token}`,
  };
}

export async function resendAgentInvite(user: SessionUser, inviteId: string, appUrl: string) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const inviteObjectId = requireObjectId(inviteId, "inviteId");
  const businessObjectId = new ObjectId(user.businessId);
  const invite = await db.collection("agent_invites").findOne({
    _id: inviteObjectId,
    businessId: businessObjectId,
  });
  if (!invite) throw new Error("Invite not found");
  if (invite.status !== "pending") throw new Error("Only pending invites can be resent");

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
  await db.collection("agent_invites").updateOne(
    { _id: inviteObjectId, businessId: businessObjectId },
    {
      $set: {
        tokenHash: hashToken(token),
        expiresAt,
        updatedAt: now,
      },
    },
  );

  await createAuditLog({
    businessId: user.businessId,
    actorUser: user,
    action: "agent.invite_resend",
    targetType: "agent_invite",
    targetId: inviteId,
    metadata: { email: invite.email },
  });

  return {
    inviteId,
    email: invite.email,
    inviteLink: `${appUrl.replace(/\/+$/, "")}/invite/accept?token=${token}`,
    expiresAt,
  };
}

export async function revokeAgentInvite(user: SessionUser, inviteId: string) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const inviteObjectId = requireObjectId(inviteId, "inviteId");
  const businessObjectId = new ObjectId(user.businessId);
  const result = await db.collection("agent_invites").updateOne(
    {
      _id: inviteObjectId,
      businessId: businessObjectId,
      status: "pending",
    },
    {
      $set: {
        status: "revoked",
        updatedAt: new Date(),
      },
    },
  );
  if (!result.matchedCount) throw new Error("Pending invite not found");

  await createAuditLog({
    businessId: user.businessId,
    actorUser: user,
    action: "agent.invite_revoke",
    targetType: "agent_invite",
    targetId: inviteId,
  });

  return { revoked: true, inviteId };
}

export async function getInviteByToken(token: string) {
  const db = await getDb();
  const invite = await db.collection("agent_invites").findOne({ tokenHash: hashToken(token) });
  if (!invite) throw new Error("Invite not found");
  if (invite.status !== "pending") throw new Error("Invite is not pending");
  if (invite.expiresAt <= new Date()) {
    await db.collection("agent_invites").updateOne(
      { _id: invite._id },
      { $set: { status: "expired", updatedAt: new Date() } },
    );
    throw new Error("Invite has expired");
  }
  const business = await db.collection("businesses").findOne({ _id: invite.businessId });
  return {
    id: invite._id.toString(),
    name: invite.name,
    email: invite.email,
    businessName: business?.name || "ClientFlow workspace",
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(input: { token: string; password: string }) {
  if (!input.password || input.password.length < 6) throw new Error("Password must be at least 6 characters");
  const db = await getDb();
  const invite = await db.collection("agent_invites").findOne({ tokenHash: hashToken(input.token) });
  if (!invite) throw new Error("Invite not found");
  await getInviteByToken(input.token);

  const user = await createSubAgentUser({
    name: invite.name,
    email: invite.email,
    password: input.password,
    businessId: invite.businessId,
    permissions: normalizeMemberPermissions(invite.permissions),
  });
  const now = new Date();
  await db.collection("agent_invites").updateOne(
    { _id: invite._id },
    { $set: { status: "accepted", acceptedAt: now, updatedAt: now } },
  );
  await createAuditLog({
    businessId: invite.businessId,
    actorUser: user,
    action: "agent.accept_invite",
    targetType: "user",
    targetId: user.id,
    metadata: { inviteId: invite._id.toString() },
  });
  return user;
}

export async function updateAgentStatus(
  user: SessionUser,
  agentUserId: string,
  status?: "active" | "disabled",
  permissionsInput?: MemberPermission[],
) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const agentObjectId = requireObjectId(agentUserId, "agentUserId");
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (permissionsInput) updates.permissions = normalizeMemberPermissions(permissionsInput);
  if (!status && !permissionsInput) throw new Error("No agent changes were provided");

  const result = await db.collection("users").updateOne(
    {
      _id: agentObjectId,
      businessId: new ObjectId(user.businessId),
      role: "sub_agent",
    },
    { $set: updates },
  );
  if (!result.matchedCount) throw new Error("Agent not found");
  await createAuditLog({
    businessId: user.businessId,
    actorUser: user,
    action: status === "disabled" ? "agent.disable" : status === "active" ? "agent.activate" : "agent.permissions_update",
    targetType: "user",
    targetId: agentUserId,
  });
  return { updated: true, permissions: permissionsInput ? normalizeMemberPermissions(permissionsInput) : undefined };
}

export async function removeAgent(user: SessionUser, agentUserId: string) {
  if (!canManageTeam(user) || !user.businessId) throw new Error("Forbidden");
  const db = await getDb();
  const agentObjectId = requireObjectId(agentUserId, "agentUserId");
  const businessObjectId = new ObjectId(user.businessId);
  const agent = await db.collection("users").findOne({
    _id: agentObjectId,
    businessId: businessObjectId,
    role: "sub_agent",
  });
  if (!agent) throw new Error("Agent not found");

  await db.collection("customers").updateMany(
    { businessId: businessObjectId, assignedAgentId: agentObjectId },
    { $set: { assignedAgentId: null, updatedAt: new Date() } },
  );
  await db.collection("users").deleteOne({ _id: agentObjectId, businessId: businessObjectId, role: "sub_agent" });
  await createAuditLog({
    businessId: user.businessId,
    actorUser: user,
    action: "agent.remove",
    targetType: "user",
    targetId: agentUserId,
    metadata: { email: agent.email },
  });
  return { removed: true };
}
