import type { ConversationRecord, ConversationStatus, Message, PaginatedResult } from "@/lib/backend/types";
import { createAuditLog } from "@/lib/audit";
import { canAssignCustomer, canSendMessage, canViewCustomer, hasPermission } from "@/lib/permissions";
import { getDb } from "@/lib/db/mongodb";
import { getCurrentUser } from "@/lib/services/auth-service";
import { assertAntiSpamContent, assertCustomerOptIn, checkOutboundRateLimit } from "@/lib/services/compliance-service";
import {
  getEvolutionChatMessages,
  listEvolutionChats,
  sendEvolutionMediaMessage,
  sendEvolutionTextMessage,
} from "@/lib/evolution/client";
import { ObjectId } from "mongodb";

type CustomerRecord = {
  _id: ObjectId;
  businessId: ObjectId;
  customerId: string;
  customerName: string;
  phone: string;
  avatar?: string;
  assignedAgentId?: ObjectId | null;
  source?: "evolution" | "manual";
  relatedJids?: string[];
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  conversationStatus?: ConversationStatus;
  tags?: string[];
  accountKey?: string;
  whatsappSessionId?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerListItem = {
  id: string;
  customerId: string;
  businessId: string;
  customerName: string;
  phone: string;
  avatar?: string;
  assignedAgentId: string | null;
  assignedAgentName?: string | null;
  source: "evolution" | "manual";
  lastMessage: string;
  lastMessageAt: number;
  createdAt: Date;
  updatedAt: Date;
};

async function getBusinessContext(userEmail: string) {
  const user = await getCurrentUser(userEmail);
  if (!user) throw new Error("Authentication required");
  if (user.status !== "active") throw new Error("Your account is not active");
  if (user.role === "super_admin") throw new Error("Super admin does not use the tenant inbox directly");
  if (!user.businessId) throw new Error("Business workspace is missing");

  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: new ObjectId(user.businessId) });
  if (!business) throw new Error("Business workspace was not found");
  if (business.status === "suspended") throw new Error("This business is suspended");
  if (business.status === "cancelled") throw new Error("This business is cancelled");

  const owner = await db.collection("users").findOne<{ email: string }>({ _id: business.ownerUserId });
  return {
    user,
    business,
    businessId: user.businessId,
    ownerEmail: owner?.email || user.email,
  };
}

async function upsertCustomers(businessId: string, conversations: ConversationRecord[]) {
  if (!conversations.length) return new Map<string, CustomerRecord>();
  const db = await getDb();
  const now = new Date();
  const businessObjectId = new ObjectId(businessId);

  const ops = conversations.map((conversation) => ({
    updateOne: {
      filter: { businessId: businessObjectId, customerId: conversation.customerId },
      update: {
        $set: {
          customerName: conversation.customerName,
          phone: conversation.phone,
          avatar: conversation.avatar,
          source: conversation.source,
          relatedJids: conversation.relatedJids || [],
          lastMessage: conversation.lastMessage,
          lastMessageAt: conversation.lastMessageAt || 0,
          unreadCount: conversation.unread || 0,
          conversationStatus: conversation.conversationStatus || "open",
          accountKey: conversation.accountKey || "primary",
          updatedAt: now,
        },
        $setOnInsert: {
          businessId: businessObjectId,
          customerId: conversation.customerId,
          assignedAgentId: null,
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  await db.collection<CustomerRecord>("customers").bulkWrite(ops, { ordered: false });

  const records = await db.collection<CustomerRecord>("customers")
    .find({ businessId: businessObjectId, customerId: { $in: conversations.map((item) => item.customerId) } })
    .toArray();
  return new Map(records.map((record) => [record.customerId, record]));
}

async function attachAssignedAgentNames(businessId: string, conversations: ConversationRecord[]) {
  const agentIds = Array.from(
    new Set(
      conversations
        .map((conversation) => conversation.assignedAgentId)
        .filter((id): id is string => typeof id === "string" && ObjectId.isValid(id)),
    ),
  );
  if (!agentIds.length) return conversations;

  const db = await getDb();
  const agents = await db.collection<{ _id: ObjectId; name: string }>("users")
    .find(
      {
        _id: { $in: agentIds.map((id) => new ObjectId(id)) },
        businessId: new ObjectId(businessId),
        role: "sub_agent",
      },
      { projection: { name: 1 } },
    )
    .toArray();
  const agentNames = new Map(agents.map((agent) => [agent._id.toString(), agent.name]));

  return conversations.map((conversation) => ({
    ...conversation,
    assignedAgentName: conversation.assignedAgentId ? agentNames.get(conversation.assignedAgentId) || null : null,
    assignedAgent: conversation.assignedAgentId ? agentNames.get(conversation.assignedAgentId) || undefined : undefined,
  }));
}

function serializeCustomer(customer: CustomerRecord, assignedAgentName?: string | null): CustomerListItem {
  return {
    id: customer.customerId,
    customerId: customer.customerId,
    businessId: customer.businessId.toString(),
    customerName: customer.customerName,
    phone: customer.phone,
    avatar: customer.avatar,
    assignedAgentId: customer.assignedAgentId?.toString() || null,
    assignedAgentName: assignedAgentName || null,
    source: customer.source || "manual",
    lastMessage: customer.lastMessage || "",
    lastMessageAt: customer.lastMessageAt || 0,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function customerToConversation(customer: CustomerRecord): ConversationRecord {
  return {
    id: customer.customerId,
    customerId: customer.customerId,
    businessId: customer.businessId.toString(),
    customerName: customer.customerName,
    phone: customer.phone,
    avatar: customer.avatar,
    lastMessage: customer.lastMessage || "",
    timestamp: customer.lastMessageAt ? new Date(customer.lastMessageAt).toISOString() : "",
    lastMessageAt: customer.lastMessageAt || 0,
    unread: Number(customer.unreadCount || 0),
    status: "offline",
    conversationStatus: customer.conversationStatus || "open",
    tags: customer.tags || [],
    assignedAgentId: customer.assignedAgentId?.toString() || null,
    accountKey: customer.accountKey || "primary",
    source: customer.source || "manual",
    relatedJids: customer.relatedJids || [],
  };
}

function normalizeManualPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) throw new Error("Enter a valid phone number");
  return {
    phone: `+${digits}`,
    customerId: `${digits}@s.whatsapp.net`,
  };
}

async function getCustomerForUser(userEmail: string, customerId: string) {
  const context = await getBusinessContext(userEmail);
  const db = await getDb();
  let customer: CustomerRecord | null = await db.collection<CustomerRecord>("customers").findOne({
    businessId: new ObjectId(context.businessId),
    customerId,
  });

  if (!customer) {
    const conversation = (await listEvolutionConversations(context.ownerEmail, 1, 50, "primary")).items
      .find((item) => item.id === customerId || item.customerId === customerId);
    if (conversation) {
      customer = (await upsertCustomers(context.businessId, [conversation])).get(conversation.customerId) || null;
    }
  }

  return { ...context, customer };
}

export async function getEvolutionOwnerEmailForCustomer(userEmail: string, customerId: string) {
  const context = await getCustomerForUser(userEmail, customerId);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) {
    throw new Error("Forbidden");
  }
  return context.ownerEmail;
}

async function listEvolutionConversations(userEmail: string, page: number, limit: number, accountKey = "primary") {
  try {
    const result = await listEvolutionChats({ userEmail, accountKey }, { page, limit });
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, accountKey })),
    };
  } catch (error) {
    console.warn(
      `[Inbox] Evolution conversations unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { items: [], nextCursor: null, hasMore: false };
  }
}

const syncDebounce = new Map<string, { expiresAt: number; promise: Promise<void> }>();
const SYNC_DEBOUNCE_MS = 25_000;

async function syncRecentEvolutionCustomers(context: Awaited<ReturnType<typeof getBusinessContext>>) {
  const debounceKey = context.businessId;
  const existing = syncDebounce.get(debounceKey);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }

  const promise = doSyncRecentEvolutionCustomers(context);
  syncDebounce.set(debounceKey, { expiresAt: Date.now() + SYNC_DEBOUNCE_MS, promise });
  return promise;
}

async function doSyncRecentEvolutionCustomers(context: Awaited<ReturnType<typeof getBusinessContext>>) {
  const db = await getDb();
  const sessions = await db.collection("whatsapp_sessions")
    .find({ businessId: new ObjectId(context.businessId), status: "connected" })
    .project({ accountKey: 1 })
    .toArray();
  const accountKeys = sessions.length
    ? sessions.map((session) => String(session.accountKey || "primary"))
    : ["primary"];

  const results = await Promise.all(
    accountKeys.map(async (accountKey) => {
      const items: ConversationRecord[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && items.length < 500) {
        const conversations = await listEvolutionConversations(context.ownerEmail, page, 50, accountKey);
        items.push(...conversations.items);
        hasMore = conversations.hasMore;
        page += 1;
      }
      return items;
    }),
  );

  const synced = results.flat();
  await upsertCustomers(context.businessId, synced);
}

export async function listConversations(
  userEmail: string,
  page = 1,
  limit = 15,
  filters?: {
    assigned?: "me" | "unassigned" | "any";
    status?: "open" | "closed" | "pending" | "any";
    unreadOnly?: boolean;
    accountKey?: string;
    q?: string;
  },
): Promise<PaginatedResult<ConversationRecord>> {
  const context = await getBusinessContext(userEmail);
  await syncRecentEvolutionCustomers(context);
  const db = await getDb();
  const query: Record<string, unknown> = { businessId: new ObjectId(context.businessId) };

  if (context.user.role === "sub_agent" && !hasPermission(context.user, "chat.view_all")) {
    query.$or = hasPermission(context.user, "chat.view_unassigned")
      ? [{ assignedAgentId: new ObjectId(context.user.id) }, { assignedAgentId: null }]
      : [{ assignedAgentId: new ObjectId(context.user.id) }];
  }
  if (filters?.assigned === "me") query.assignedAgentId = new ObjectId(context.user.id);
  if (filters?.assigned === "unassigned") query.assignedAgentId = null;
  if (filters?.status && filters.status !== "any") query.conversationStatus = filters.status;
  if (filters?.unreadOnly) query.unreadCount = { $gt: 0 };
  if (filters?.accountKey) query.accountKey = filters.accountKey;
  if (filters?.q?.trim()) {
    const escaped = filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$and = [{ $or: [
      { customerName: { $regex: escaped, $options: "i" } },
      { phone: { $regex: escaped, $options: "i" } },
      { lastMessage: { $regex: escaped, $options: "i" } },
    ] }];
  }

  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safePage = Math.max(1, page);
  const customers = await db.collection<CustomerRecord>("customers")
    .find(query)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit + 1)
    .toArray();
  const hasMore = customers.length > safeLimit;
  const items = await attachAssignedAgentNames(
    context.businessId,
    customers.slice(0, safeLimit).map(customerToConversation),
  );
  return { items, nextCursor: hasMore ? String(safePage + 1) : null, hasMore };
}

export async function listCustomers(userEmail: string) {
  const context = await getBusinessContext(userEmail);
  await syncRecentEvolutionCustomers(context);
  const db = await getDb();
  const businessObjectId = new ObjectId(context.businessId);
  const query: Record<string, unknown> = { businessId: businessObjectId };

  if (context.user.role === "sub_agent" && !hasPermission(context.user, "chat.view_all")) {
    query.$or = hasPermission(context.user, "chat.view_unassigned")
      ? [{ assignedAgentId: new ObjectId(context.user.id) }, { assignedAgentId: null }]
      : [{ assignedAgentId: new ObjectId(context.user.id) }];
  }

  const customers = await db.collection<CustomerRecord>("customers")
    .find(query)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .toArray();
  const agentIds = Array.from(
    new Set(
      customers
        .map((customer) => customer.assignedAgentId?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const agents = agentIds.length
    ? await db.collection<{ _id: ObjectId; name: string }>("users")
        .find(
          {
            _id: { $in: agentIds.map((id) => new ObjectId(id)) },
            businessId: businessObjectId,
            role: "sub_agent",
          },
          { projection: { name: 1 } },
        )
        .toArray()
    : [];
  const agentNames = new Map(agents.map((agent) => [agent._id.toString(), agent.name]));

  return customers.map((customer) =>
    serializeCustomer(customer, customer.assignedAgentId ? agentNames.get(customer.assignedAgentId.toString()) : null),
  );
}

export async function createManualCustomer(userEmail: string, input: {
  name: string;
  phone: string;
  assignedAgentId?: string | null;
}) {
  const context = await getBusinessContext(userEmail);
  if (context.user.role !== "admin") throw new Error("Forbidden");

  const name = input.name?.trim();
  if (!name) throw new Error("Customer name is required");
  const normalized = normalizeManualPhone(input.phone || "");
  const db = await getDb();
  const now = new Date();
  const businessObjectId = new ObjectId(context.businessId);
  let assignedAgentObjectId: ObjectId | null = null;

  if (input.assignedAgentId) {
    if (!ObjectId.isValid(input.assignedAgentId)) throw new Error("Invalid agentUserId");
    const agent = await db.collection("users").findOne({
      _id: new ObjectId(input.assignedAgentId),
      businessId: businessObjectId,
      role: "sub_agent",
      status: "active",
    });
    if (!agent) throw new Error("Agent must belong to this business");
    assignedAgentObjectId = agent._id;
  }

  const customer = {
    businessId: businessObjectId,
    customerId: normalized.customerId,
    customerName: name,
    phone: normalized.phone,
    assignedAgentId: assignedAgentObjectId,
    source: "manual" as const,
    relatedJids: [normalized.customerId],
    lastMessage: "Manual customer created",
    lastMessageAt: now.getTime(),
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection<CustomerRecord>("customers").findOneAndUpdate(
    { businessId: businessObjectId, customerId: normalized.customerId },
    {
      $set: {
        customerName: customer.customerName,
        phone: customer.phone,
        assignedAgentId: assignedAgentObjectId,
        source: "manual",
        relatedJids: [normalized.customerId],
        lastMessage: customer.lastMessage,
        lastMessageAt: customer.lastMessageAt,
        updatedAt: now,
      },
      $setOnInsert: {
        businessId: businessObjectId,
        customerId: normalized.customerId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "customer.create_manual",
    targetType: "customer",
    targetId: result?._id,
    metadata: { customerId: customer.customerId, phone: customer.phone },
  });

  if (!result) throw new Error("Customer could not be saved");
  return serializeCustomer(result);
}

export async function createCustomerFromChat(userEmail: string, input: {
  chatId: string;
  name?: string;
}) {
  const context = await getBusinessContext(userEmail);
  if (context.user.role !== "admin") throw new Error("Forbidden");

  const chatId = input.chatId?.trim();
  if (!chatId) throw new Error("chatId is required");

  const db = await getDb();
  const businessObjectId = new ObjectId(context.businessId);
  await syncRecentEvolutionCustomers(context);

  let existing = await db.collection<CustomerRecord>("customers").findOne({
    businessId: businessObjectId,
    customerId: chatId,
  });

  if (!existing) {
    let page = 1;
    let found: ConversationRecord | null = null;
    while (!found && page <= 10) {
      const conversations = await listEvolutionConversations(context.ownerEmail, page, 50);
      found = conversations.items.find((conversation) => conversation.customerId === chatId || conversation.id === chatId) || null;
      if (!conversations.hasMore) break;
      page += 1;
    }

    if (!found) throw new Error("Chat was not found");
    existing = (await upsertCustomers(context.businessId, [found])).get(found.customerId) || null;
  }

  if (!existing) throw new Error("Customer could not be created from chat");

  const name = input.name?.trim();
  const updated = name
    ? await db.collection<CustomerRecord>("customers").findOneAndUpdate(
        { _id: existing._id },
        { $set: { customerName: name, source: "evolution", updatedAt: new Date() } },
        { returnDocument: "after" },
      )
    : existing;

  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "customer.create_from_chat",
    targetType: "customer",
    targetId: existing._id,
    metadata: { customerId: existing.customerId, chatId },
  });

  return serializeCustomer(updated || existing);
}

export async function getConversation(userEmail: string, id: string) {
  const context = await getCustomerForUser(userEmail, id);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) return null;
  const [item] = await attachAssignedAgentNames(context.businessId, [customerToConversation(context.customer)]);
  return item;
}

export async function getConversationMessages(
  userEmail: string,
  id: string,
  page = 1,
  limit = 15,
): Promise<PaginatedResult<Message>> {
  const context = await getCustomerForUser(userEmail, id);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) {
    throw new Error("Forbidden");
  }
  try {
    return await getEvolutionChatMessages(id, {
      userEmail: context.ownerEmail,
      accountKey: context.customer.accountKey || "primary",
    }, { page, limit });
  } catch (error) {
    console.warn(
      `[Inbox] Evolution messages unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { items: [], nextCursor: null, hasMore: false };
  }
}

export async function assignConversation(userEmail: string, id: string, assignedAgent: string | null) {
  return assignCustomerToAgent(userEmail, id, assignedAgent);
}

export async function updateConversationStatus(userEmail: string, id: string, status: ConversationStatus) {
  if (!["open", "pending", "closed"].includes(status)) throw new Error("Invalid conversation status");
  const context = await getCustomerForUser(userEmail, id);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) throw new Error("Forbidden");
  await (await getDb()).collection("customers").updateOne(
    { _id: context.customer._id, businessId: new ObjectId(context.businessId) },
    { $set: { conversationStatus: status, updatedAt: new Date() } },
  );
  return { ...customerToConversation(context.customer), conversationStatus: status };
}

export async function markConversationRead(userEmail: string, id: string) {
  const context = await getCustomerForUser(userEmail, id);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) throw new Error("Forbidden");
  await (await getDb()).collection("customers").updateOne(
    { _id: context.customer._id, businessId: new ObjectId(context.businessId) },
    { $set: { unreadCount: 0, updatedAt: new Date() } },
  );
  return { ...customerToConversation(context.customer), unread: 0 };
}

export async function sendMessage(input: {
  userEmail: string;
  conversationId: string;
  content: string;
  senderName?: string;
  type?: Message["type"];
}) {
  const context = await getCustomerForUser(input.userEmail, input.conversationId);
  if (!context.customer || !canSendMessage(context.user, context.customer)) {
    throw new Error("Forbidden");
  }
  await assertCustomerOptIn(context.businessId, input.conversationId);
  await checkOutboundRateLimit(context.businessId);
  await assertAntiSpamContent({
    businessId: context.businessId,
    customerId: input.conversationId,
    content: input.content,
  });
  const message = await sendEvolutionTextMessage(input.conversationId, input.content, {
    userEmail: context.ownerEmail,
    accountKey: context.customer.accountKey || "primary",
  });
  const now = new Date();
  const db = await getDb();
  await db.collection("messages").insertOne({
    businessId: new ObjectId(context.businessId),
    whatsappSessionId: context.customer.whatsappSessionId || null,
    accountKey: context.customer.accountKey || "primary",
    customerId: input.conversationId,
    messageId: message.id,
    direction: "outgoing",
    messageType: "text",
    text: input.content,
    senderType: "agent",
    senderUserId: new ObjectId(context.user.id),
    source: "manual",
    aiGenerated: false,
    createdAt: now,
  });
  await db.collection("customers").updateOne(
    { _id: context.customer._id },
    { $set: { lastMessage: input.content, lastMessageAt: now.getTime(), lastOutgoingMessageAt: now, updatedAt: now } },
  );
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "message.send",
    targetType: "customer",
    targetId: context.customer._id,
    metadata: { customerId: input.conversationId, messageType: "text" },
  });
  return message;
}

export async function sendMediaMessage(input: {
  userEmail: string;
  conversationId: string;
  content?: string;
  senderName?: string;
  fileName: string;
  mimetype: string;
  base64: string;
}) {
  const context = await getCustomerForUser(input.userEmail, input.conversationId);
  if (!context.customer || !canSendMessage(context.user, context.customer)) {
    throw new Error("Forbidden");
  }
  await assertCustomerOptIn(context.businessId, input.conversationId);
  await checkOutboundRateLimit(context.businessId);
  const caption = input.content?.trim() || "";
  if (caption) {
    await assertAntiSpamContent({
      businessId: context.businessId,
      customerId: input.conversationId,
      content: caption,
    });
  }
  const message = await sendEvolutionMediaMessage(input.conversationId, {
    base64: input.base64,
    mimetype: input.mimetype,
    fileName: input.fileName,
    caption,
  }, { userEmail: context.ownerEmail, accountKey: context.customer.accountKey || "primary" });
  const now = new Date();
  const db = await getDb();
  await db.collection("messages").insertOne({
    businessId: new ObjectId(context.businessId),
    whatsappSessionId: context.customer.whatsappSessionId || null,
    accountKey: context.customer.accountKey || "primary",
    customerId: input.conversationId,
    messageId: message.id,
    direction: "outgoing",
    messageType: input.mimetype.startsWith("image/") ? "image" : "document",
    text: caption,
    fileName: input.fileName,
    mediaMimeType: input.mimetype,
    senderType: "agent",
    senderUserId: new ObjectId(context.user.id),
    source: "manual",
    aiGenerated: false,
    createdAt: now,
  });
  await db.collection("customers").updateOne(
    { _id: context.customer._id },
    {
      $set: {
        lastMessage: caption || `[${input.fileName}]`,
        lastMessageAt: now.getTime(),
        lastOutgoingMessageAt: now,
        updatedAt: now,
      },
    },
  );
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "message.send_media",
    targetType: "customer",
    targetId: context.customer._id,
    metadata: { customerId: input.conversationId, fileName: input.fileName, mimetype: input.mimetype },
  });
  return message;
}

export async function assignCustomerToAgent(userEmail: string, customerId: string, agentUserId: string | null) {
  const context = await getCustomerForUser(userEmail, customerId);
  if (!context.customer || !canAssignCustomer(context.user, context.customer)) {
    throw new Error("Forbidden");
  }

  const db = await getDb();
  let agentObjectId: ObjectId | null = null;
  if (agentUserId) {
    if (!ObjectId.isValid(agentUserId)) throw new Error("Invalid agentUserId");
    const agent = await db.collection("users").findOne({
      _id: new ObjectId(agentUserId),
      businessId: new ObjectId(context.businessId),
      role: "sub_agent",
      status: "active",
    });
    if (!agent) throw new Error("Agent must belong to this business");
    agentObjectId = agent._id;
  }

  await db.collection<CustomerRecord>("customers").updateOne(
    { _id: context.customer._id },
    { $set: { assignedAgentId: agentObjectId, updatedAt: new Date() } },
  );
  await createAuditLog({
    businessId: context.businessId,
    actorUser: context.user,
    action: "customer.assign",
    targetType: "customer",
    targetId: context.customer._id,
    metadata: { customerId, agentUserId },
  });

  const conversation = await getConversation(userEmail, customerId);
  if (conversation) return conversation;

  const updatedCustomer = await db.collection<CustomerRecord>("customers").findOne({ _id: context.customer._id });
  return updatedCustomer ? serializeCustomer(updatedCustomer) : null;
}

export async function updateCustomerLead(
  userEmail: string,
  customerId: string,
  input: {
    leadStatus?: "new" | "interested" | "meeting_booked" | "closed";
    tags?: string[];
    note?: string;
  },
) {
  const context = await getCustomerForUser(userEmail, customerId);
  if (!context.customer || !canViewCustomer(context.user, context.customer)) {
    throw new Error("Forbidden");
  }

  const db = await getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.leadStatus) updates.status = input.leadStatus;
  if (Array.isArray(input.tags)) {
    updates.tags = input.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  if (input.note && input.note.trim()) {
    await db.collection("customer_notes").insertOne({
      businessId: new ObjectId(context.businessId),
      customerId,
      note: input.note.trim(),
      createdByUserId: new ObjectId(context.user.id),
      createdAt: new Date(),
    });
  }

  await db.collection("customers").updateOne(
    { _id: context.customer._id },
    { $set: updates },
  );

  const updated = await db.collection("customers").findOne({ _id: context.customer._id });
  return updated
    ? {
      customerId,
      leadStatus: String((updated as Record<string, unknown>).status || "new"),
      tags: Array.isArray((updated as Record<string, unknown>).tags) ? (updated as Record<string, unknown>).tags : [],
      updatedAt: (updated as Record<string, unknown>).updatedAt || null,
    }
    : null;
}
