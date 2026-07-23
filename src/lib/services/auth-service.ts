import type { MemberPermission, SessionUser } from "@/lib/backend/types";
import { getDb } from "@/lib/db/mongodb";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import type { Collection, ObjectId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";

const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

interface DbUser {
  name: string;
  email: string;
  normalizedEmail: string;
  role: "super_admin" | "admin" | "sub_agent" | "agent";
  businessId?: ObjectId | null;
  status?: "active" | "disabled" | "pending";
  permissions?: MemberPermission[];
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  createdAt: Date;
  updatedAt: Date;
}

let usersIndexPromise: Promise<string> | null = null;
let businessIndexPromise: Promise<string[]> | null = null;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString("hex");

  return {
    hash,
    salt,
    iterations: PASSWORD_ITERATIONS,
  };
}

function verifyPassword(password: string, user: DbUser) {
  const attemptedHash = pbkdf2Sync(
    password,
    user.passwordSalt,
    user.passwordIterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  );
  const storedHash = Buffer.from(user.passwordHash, "hex");

  if (attemptedHash.length !== storedHash.length) return false;
  return timingSafeEqual(attemptedHash, storedHash);
}

async function getUsersCollection(): Promise<Collection<DbUser>> {
  const db = await getDb();
  const collection = db.collection<DbUser>("users");

  usersIndexPromise ??= collection.createIndex(
    { normalizedEmail: 1 },
    { unique: true, name: "users_normalized_email_unique" },
  );
  await usersIndexPromise;

  return collection;
}

async function ensureBusinessIndexes() {
  const db = await getDb();
  businessIndexPromise ??= Promise.all([
    db.collection("businesses").createIndex({ ownerUserId: 1 }, { name: "businesses_owner_user_lookup" }),
    db.collection("whatsapp_sessions").createIndex({ businessId: 1 }, { name: "whatsapp_sessions_business" }),
    db.collection("customers").createIndex({ businessId: 1, customerId: 1 }, { unique: true, name: "customers_tenant_customer_unique" }),
    db.collection("customers").createIndex({ businessId: 1, assignedAgentId: 1 }, { name: "customers_assigned_agent" }),
    db.collection("agent_invites").createIndex({ tokenHash: 1 }, { unique: true, name: "agent_invites_token_hash_unique" }),
    db.collection("audit_logs").createIndex({ businessId: 1, createdAt: -1 }, { name: "audit_logs_business_created" }),
  ]);
  await businessIndexPromise;
}

async function ensureUserBusiness(user: DbUser & { _id: ObjectId }) {
  await ensureBusinessIndexes();
  const users = await getUsersCollection();
  const db = await getDb();
  const normalizedSuperAdmin = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();

  const legacyRole = user.role === "agent" ? "sub_agent" : user.role;
  if (normalizedSuperAdmin && user.normalizedEmail === normalizedSuperAdmin && legacyRole !== "super_admin") {
    await users.updateOne(
      { _id: user._id },
      { $set: { role: "super_admin", businessId: null, status: "active", updatedAt: new Date() } },
    );
    return { ...user, role: "super_admin" as const, businessId: null, status: "active" as const };
  }

  if (legacyRole === "super_admin") {
    if (user.businessId || user.status !== "active" || user.role !== "super_admin") {
      await users.updateOne(
        { _id: user._id },
        { $set: { role: "super_admin", businessId: null, status: "active", updatedAt: new Date() } },
      );
    }
    return { ...user, role: "super_admin" as const, businessId: null, status: "active" as const };
  }

  if (user.businessId && user.status && user.role !== "agent") {
    return { ...user, role: legacyRole, status: user.status };
  }

  const now = new Date();
  let business = await db.collection("businesses").findOne({ ownerUserId: user._id });
  if (!business) {
    const result = await db.collection("businesses").insertOne({
      name: `${user.name}'s Business`,
      ownerUserId: user._id,
      plan: "free",
      status: "active",
      limits: PLAN_LIMITS.free,
      createdAt: now,
      updatedAt: now,
    });
    business = { _id: result.insertedId };
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        role: "admin",
        businessId: business._id,
        status: "active",
        updatedAt: now,
      },
    },
  );

  return {
    ...user,
    role: "admin" as const,
    businessId: business._id as ObjectId,
    status: "active" as const,
  };
}

function toSessionUser(user: {
  _id?: ObjectId;
  id?: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "sub_agent" | "agent";
  businessId?: ObjectId | string | null;
  status?: "active" | "disabled" | "pending";
  permissions?: MemberPermission[];
}): SessionUser {
  return {
    id: user.id ?? user._id?.toString() ?? user.email,
    name: user.name,
    email: user.email,
    role: user.role === "agent" ? "sub_agent" : user.role,
    businessId: user.businessId?.toString() ?? null,
    status: user.status || "active",
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const name = input.name?.trim();
  const email = input.email?.trim();
  const password = input.password ?? "";

  if (!name || !email || !password) {
    throw new Error("name, email and password are required");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const users = await getUsersCollection();
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await users.findOne({ normalizedEmail });

  if (existingUser) {
    throw new Error("Account already exists with this email");
  }

  if (process.env.ALLOW_PUBLIC_REGISTRATION === "false") {
    throw new Error("Public registration is disabled");
  }

  const passwordData = hashPassword(password);
  const now = new Date();
  await ensureBusinessIndexes();
  const user: DbUser = {
    name,
    email,
    normalizedEmail,
    role: "admin" as const,
    businessId: null,
    status: "active",
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    passwordIterations: passwordData.iterations,
    createdAt: now,
    updatedAt: now,
  };

  const result = await users.insertOne(user);
  const businessResult = await (await getDb()).collection("businesses").insertOne({
    name: `${name}'s Business`,
    ownerUserId: result.insertedId,
    plan: "free",
    status: "active",
    limits: PLAN_LIMITS.free,
    createdAt: now,
    updatedAt: now,
  });
  await users.updateOne(
    { _id: result.insertedId },
    { $set: { businessId: businessResult.insertedId, updatedAt: now } },
  );

  return toSessionUser({ ...user, _id: result.insertedId, businessId: businessResult.insertedId });
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email?.trim();
  const password = input.password ?? "";

  if (!email || !password) {
    throw new Error("email and password are required");
  }

  const users = await getUsersCollection();
  const user = await users.findOne({ normalizedEmail: normalizeEmail(email) });

  if (!user || !verifyPassword(password, user)) {
    throw new Error("Invalid email or password");
  }

  const migratedUser = await ensureUserBusiness(user as DbUser & { _id: ObjectId });
  if (migratedUser.status !== "active") {
    throw new Error("Your account is not active");
  }
  if (migratedUser.businessId) {
    const business = await (await getDb()).collection("businesses").findOne({ _id: migratedUser.businessId });
    if (business?.status === "suspended" || business?.status === "cancelled") {
      throw new Error("This business workspace is not active");
    }
  }

  return {
    user: toSessionUser(migratedUser),
  };
}

export function logoutUser() {
  return { loggedOut: true };
}

export async function getCurrentUser(email?: string | null) {
  if (!email) return null;
  const users = await getUsersCollection();
  const user = await users.findOne({ normalizedEmail: normalizeEmail(email) });
  if (!user) return null;
  const migratedUser = await ensureUserBusiness(user as DbUser & { _id: ObjectId });
  return toSessionUser(migratedUser);
}

export async function requireCurrentUser(email?: string | null) {
  const user = await getCurrentUser(email);
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function createSubAgentUser(input: {
  name: string;
  email: string;
  password: string;
  businessId: string | ObjectId;
  permissions?: MemberPermission[];
}) {
  const users = await getUsersCollection();
  const normalizedEmail = normalizeEmail(input.email);
  const existingUser = await users.findOne({ normalizedEmail });
  if (existingUser) throw new Error("Account already exists with this email");

  const passwordData = hashPassword(input.password);
  const now = new Date();
  const user: DbUser = {
    name: input.name.trim(),
    email: input.email.trim(),
    normalizedEmail,
    role: "sub_agent",
    businessId: new MongoObjectId(input.businessId.toString()),
    status: "active",
    permissions: input.permissions || [],
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    passwordIterations: passwordData.iterations,
    createdAt: now,
    updatedAt: now,
  };
  const result = await users.insertOne(user);
  return toSessionUser({ ...user, _id: result.insertedId });
}

export async function listBusinessUsers(businessId: string, role?: "admin" | "sub_agent") {
  const users = await getUsersCollection();
  const query: Record<string, unknown> = { businessId: new MongoObjectId(businessId) };
  if (role) query.role = role;
  const items = await users
    .find(query, { projection: { passwordHash: 0, passwordSalt: 0, passwordIterations: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  return items.map(toSessionUser);
}
