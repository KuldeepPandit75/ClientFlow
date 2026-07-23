import { ObjectId } from "mongodb";
import { createAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/backend/types";
import { getDb } from "@/lib/db/mongodb";
import { canManagePlatform } from "@/lib/permissions";

interface RazorpayPlatformSettings {
  _id: string;
  provider?: "razorpay";
  keyId?: string;
  keySecret?: string;
  updatedByUserId?: ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function assertPlatform(user: SessionUser) {
  if (!canManagePlatform(user)) throw new Error("Forbidden");
}

function requireObjectId(value: string, label: string) {
  if (!ObjectId.isValid(value)) throw new Error(`Invalid ${label}`);
  return new ObjectId(value);
}

export async function getPlatformOverview(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    totalUsers,
    totalAdmins,
    totalSubAgents,
    connectedWhatsappSessions,
    disconnectedWhatsappSessions,
    totalCustomers,
    monthlyMessages,
    paidBusinesses,
    unpaidBusinesses,
    revenue,
  ] = await Promise.all([
    db.collection("businesses").countDocuments(),
    db.collection("businesses").countDocuments({ status: "active" }),
    db.collection("businesses").countDocuments({ status: "suspended" }),
    db.collection("users").countDocuments(),
    db.collection("users").countDocuments({ role: "admin" }),
    db.collection("users").countDocuments({ role: "sub_agent" }),
    db.collection("whatsapp_sessions").countDocuments({ status: { $in: ["connected", "open"] } }),
    db.collection("whatsapp_sessions").countDocuments({ status: { $nin: ["connected", "open"] } }),
    db.collection("customers").countDocuments(),
    db.collection("messages").countDocuments({ createdAt: { $gte: monthStart } }),
    db.collection("businesses").countDocuments({ plan: { $ne: "free" } }),
    db.collection("businesses").countDocuments({ plan: "free" }),
    db.collection("billing_payments").aggregate([
      { $match: { status: { $in: ["paid", "applied"] }, createdAt: { $gte: monthStart } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]).toArray(),
  ]);

  return {
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    totalUsers,
    totalAdmins,
    totalSubAgents,
    connectedWhatsappSessions,
    disconnectedWhatsappSessions,
    totalCustomers,
    monthlyMessages,
    paidBusinesses,
    unpaidBusinesses,
    monthlyRevenue: revenue[0]?.amount ? Math.round(revenue[0].amount / 100) : 0,
  };
}

export async function listBusinesses(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const businesses = await db.collection("businesses").find().sort({ createdAt: -1 }).toArray();
  return Promise.all(
    businesses.map(async (business) => {
      const [owner, whatsapp, agentsCount, customersCount] = await Promise.all([
        db.collection("users").findOne({ _id: business.ownerUserId }),
        db.collection("whatsapp_sessions").findOne({ businessId: business._id }),
        db.collection("users").countDocuments({ businessId: business._id, role: "sub_agent" }),
        db.collection("customers").countDocuments({ businessId: business._id }),
      ]);
      const lastPayment = await db.collection("billing_payments").findOne(
        { businessId: business._id, status: { $in: ["paid", "applied"] } },
        { sort: { paidAt: -1, createdAt: -1 } },
      );
      return {
        id: business._id.toString(),
        name: business.name,
        ownerName: owner?.name || "-",
        ownerEmail: owner?.email || "-",
        plan: business.plan,
        status: business.status,
        paymentStatus: business.plan === "free" ? "not paid" : lastPayment ? "paid" : "unpaid",
        lastPaymentAmount: lastPayment?.amount ? `₹${Math.round(lastPayment.amount / 100).toLocaleString("en-IN")}` : "-",
        lastPaymentAt: lastPayment?.paidAt || lastPayment?.createdAt || "-",
        whatsappStatus: whatsapp?.status || "disconnected",
        agentsCount,
        customersCount,
        createdAt: business.createdAt,
      };
    }),
  );
}

export async function getBusinessDetail(user: SessionUser, businessId: string) {
  assertPlatform(user);
  const db = await getDb();
  const _id = requireObjectId(businessId, "businessId");
  const business = await db.collection("businesses").findOne({ _id });
  if (!business) throw new Error("Business not found");
  const [users, whatsappSessions, customersCount, payments] = await Promise.all([
    db.collection("users").find({ businessId: _id }, { projection: { passwordHash: 0, passwordSalt: 0, passwordIterations: 0 } }).toArray(),
    db.collection("whatsapp_sessions").find({ businessId: _id }).toArray(),
    db.collection("customers").countDocuments({ businessId: _id }),
    db.collection("billing_payments").find({ businessId: _id }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  return {
    id: business._id.toString(),
    name: business.name,
    plan: business.plan,
    status: business.status,
    limits: business.limits,
    users: users.map((item) => ({ ...item, _id: item._id.toString(), businessId: item.businessId?.toString?.() || null })),
    whatsappSessions: whatsappSessions.map((item) => ({ ...item, _id: item._id.toString(), businessId: item.businessId?.toString?.() || null })),
    payments: payments.map((item) => ({ ...item, _id: item._id.toString(), businessId: item.businessId?.toString?.() || null, userId: item.userId?.toString?.() || null })),
    customersCount,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}

export async function updateBusinessStatus(user: SessionUser, businessId: string, status: "active" | "suspended" | "cancelled") {
  assertPlatform(user);
  const db = await getDb();
  const _id = requireObjectId(businessId, "businessId");
  const result = await db.collection("businesses").updateOne(
    { _id },
    { $set: { status, updatedAt: new Date() } },
  );
  if (!result.matchedCount) throw new Error("Business not found");
  await createAuditLog({
    businessId,
    actorUser: user,
    action: `business.${status}`,
    targetType: "business",
    targetId: businessId,
  });
  return { updated: true };
}

export async function listPlatformUsers(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const users = await db.collection("users")
    .find({}, { projection: { passwordHash: 0, passwordSalt: 0, passwordIterations: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  return users.map((item) => ({ ...item, _id: item._id.toString(), businessId: item.businessId?.toString?.() || null }));
}

export async function listPlatformAdmins(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const admins = await db.collection("users")
    .find({ role: "admin" }, { projection: { passwordHash: 0, passwordSalt: 0, passwordIterations: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  return Promise.all(admins.map(async (admin) => {
    const business = admin.businessId ? await db.collection("businesses").findOne({ _id: admin.businessId }) : null;
    const lastPayment = business
      ? await db.collection("billing_payments").findOne(
        { businessId: business._id, status: { $in: ["paid", "applied"] } },
        { sort: { paidAt: -1, createdAt: -1 } },
      )
      : null;

    return {
      _id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      status: admin.status,
      businessId: admin.businessId?.toString?.() || null,
      businessName: business?.name || "-",
      plan: business?.plan || "-",
      businessStatus: business?.status || "-",
      paymentStatus: business?.plan === "free" ? "not paid" : lastPayment ? "paid" : "unpaid",
      lastPaymentAmount: lastPayment?.amount ? `₹${Math.round(lastPayment.amount / 100).toLocaleString("en-IN")}` : "-",
      lastPaymentAt: lastPayment?.paidAt || lastPayment?.createdAt || "-",
    };
  }));
}

export async function listWhatsappSessions(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const sessions = await db.collection("whatsapp_sessions").find().sort({ updatedAt: -1 }).toArray();
  return sessions.map((item) => ({ ...item, _id: item._id.toString(), businessId: item.businessId?.toString?.() || null }));
}

export async function listAuditLogs(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const logs = await db.collection("audit_logs").find().sort({ createdAt: -1 }).limit(200).toArray();
  return logs.map((item) => ({
    ...item,
    _id: item._id.toString(),
    businessId: item.businessId?.toString?.() || null,
    actorUserId: item.actorUserId?.toString?.() || null,
  }));
}

function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

export async function getPaymentSettings(user: SessionUser) {
  assertPlatform(user);
  const db = await getDb();
  const settings = await db.collection<RazorpayPlatformSettings>("platform_settings").findOne({ _id: "razorpay" });
  const envKeyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  const envSecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";

  return {
    provider: "razorpay",
    source: settings?.keyId && settings?.keySecret ? "database override" : "environment",
    keyId: settings?.keyId || envKeyId,
    keySecretMasked: maskSecret(settings?.keySecret || envSecret),
    hasKeySecret: Boolean(settings?.keySecret || envSecret),
    updatedAt: settings?.updatedAt || null,
  };
}

export async function updatePaymentSettings(user: SessionUser, input: { keyId?: string; keySecret?: string }) {
  assertPlatform(user);
  const keyId = input.keyId?.trim();
  const keySecret = input.keySecret?.trim();
  if (!keyId || !keySecret) throw new Error("Razorpay key id and key secret are required");

  const db = await getDb();
  const now = new Date();
  await db.collection<RazorpayPlatformSettings>("platform_settings").updateOne(
    { _id: "razorpay" },
    {
      $set: {
        provider: "razorpay",
        keyId,
        keySecret,
        updatedByUserId: ObjectId.isValid(user.id) ? new ObjectId(user.id) : null,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  await createAuditLog({
    actorUser: user,
    action: "platform.razorpay_settings_updated",
    targetType: "platform_settings",
    targetId: "razorpay",
  });

  return getPaymentSettings(user);
}
