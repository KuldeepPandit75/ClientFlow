import QRCode from "qrcode";
import { createHash } from "crypto";
import type { ConversationRecord, Message, PaginatedResult } from "@/lib/backend/types";

export interface EvolutionConnectionResult {
  configured: boolean;
  instanceName: string;
  baseUrl: string;
  state: string;
  connected: boolean;
  qrCode: string | null;
  rawQrCode: string | null;
  pairingCode: string | null;
  qrCount: number | null;
  businessNumber: string;
  webhookUrl: string;
  lastCheckedAt: string;
  message: string | null;
}

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  instanceToken: string;
  webhookUrl: string;
  webhookSecret: string;
  autoBootstrap: boolean;
}

interface EvolutionContext {
  userEmail?: string | null;
  accountKey?: string | null;
}

interface EvolutionInstanceEnvelope {
  name?: string;
  instanceName?: string;
  owner?: string;
  ownerJid?: string;
  connectionStatus?: string;
  status?: string;
  state?: string;
  instance?: {
    instanceName?: string;
    name?: string;
    owner?: string;
    ownerJid?: string;
    profileName?: string;
    connectionStatus?: string;
    status?: string;
    state?: string;
  };
}

interface EvolutionConnectionResponse {
  pairingCode?: string | null;
  code?: string | null;
  base64?: string | null;
  qrcode?: {
    pairingCode?: string | null;
    base64?: string | null;
    code?: string | null;
    count?: number | null;
  };
  count?: number | null;
}

interface EvolutionCreateResponse extends EvolutionConnectionResponse {
  instance?: EvolutionInstanceEnvelope["instance"] & {
    status?: string;
  };
  pairingCode?: string | null;
}

interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: {
    caption?: string;
    fileName?: string;
    jpegThumbnail?: string;
    mimetype?: string;
    url?: string;
  };
  videoMessage?: {
    caption?: string;
    fileName?: string;
    jpegThumbnail?: string;
    mimetype?: string;
    url?: string;
  };
  documentMessage?: {
    caption?: string;
    fileName?: string;
    jpegThumbnail?: string;
    mimetype?: string;
    url?: string;
  };
  audioMessage?: unknown;
  stickerMessage?: unknown;
  locationMessage?: unknown;
  contactMessage?: unknown;
  contactsArrayMessage?: unknown;
  templateMessage?: {
    hydratedTemplate?: {
      hydratedContentText?: string;
      hydratedFooterText?: string;
    };
  };
  interactiveMessage?: {
    body?: { text?: string };
  };
}

interface EvolutionMessageRecord {
  id?: string;
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
    participant?: string;
  };
  pushName?: string;
  name?: string;
  senderName?: string;
  messageType?: string;
  message?: EvolutionMessageContent;
  messageTimestamp?: number | string;
  status?: string;
}

interface EvolutionChatRecord {
  id?: string | null;
  remoteJid?: string | null;
  pushName?: string | null;
  name?: string | null;
  contactName?: string | null;
  verifiedName?: string | null;
  notify?: string | null;
  profilePicUrl?: string | null;
  updatedAt?: string | null;
  unreadCount?: number | null;
  isSaved?: boolean | null;
  isOnline?: boolean | null;
  presence?: string | null;
  lastPresence?: string | null;
  composing?: boolean | null;
  paused?: boolean | null;
  lastMessage?: EvolutionMessageRecord | null;
}

interface EvolutionFindMessagesResponse {
  messages?: {
    records?: EvolutionMessageRecord[];
    total?: number;
  };
  records?: EvolutionMessageRecord[];
}

interface EvolutionPageOptions {
  page?: number;
  limit?: number;
}

interface EvolutionContactRecord {
  remoteJid?: string | null;
  id?: string | null;
  pushName?: string | null;
  name?: string | null;
  notify?: string | null;
  shortName?: string | null;
  verifiedName?: string | null;
  contactName?: string | null;
  profilePicUrl?: string | null;
  profilePictureUrl?: string | null;
  imgUrl?: string | null;
  isOnline?: boolean | null;
  presence?: string | null;
  lastPresence?: string | null;
}

interface EvolutionMediaResponse {
  mediaType?: string;
  fileName?: string;
  mimetype?: string;
  base64?: string;
}

interface EvolutionMediaKey {
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
}

interface EvolutionOutboundMedia {
  base64: string;
  mimetype: string;
  fileName: string;
  caption?: string;
}

const PLACEHOLDER_VALUES = new Set([
  "",
  "https://your-evolution-api.example.com",
  "your_evolution_api_key",
]);
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";
const CHAT_CACHE_TTL_MS = 30_000;
const chatCache = new Map<string, { expiresAt: number; items: ConversationRecord[] }>();
const rawChatCache = new Map<string, { expiresAt: number; chats: EvolutionChatRecord[] }>();
const connectionStateCache = new Map<string, { expiresAt: number; state: string }>();
const CONNECTION_STATE_TTL_MS = 15_000;

function cleanUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function hashValue(value: string, length = 12) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function cleanInstancePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function normalizeAccountKey(value?: string | null) {
  const cleaned = cleanInstancePart(value || "");
  return cleaned || "primary";
}

export function getUserEvolutionInstanceName(userEmail?: string | null, accountKey?: string | null) {
  const baseName = cleanInstancePart(
    process.env.EVOLUTION_INSTANCE_PREFIX?.trim() ||
      process.env.EVOLUTION_INSTANCE_NAME?.trim() ||
      "clientflow",
  );
  const accountSegment = normalizeAccountKey(accountKey);

  if (!userEmail) return `${baseName}-${accountSegment}`;

  const normalizedEmail = userEmail.trim().toLowerCase();
  const localPart = cleanInstancePart(normalizedEmail.split("@")[0] || "user") || "user";
  return `${baseName}-${localPart}-${accountSegment}-${hashValue(normalizedEmail)}`;
}

function getInstanceName(item: EvolutionInstanceEnvelope) {
  return item.instance?.instanceName || item.instance?.name || item.instanceName || item.name;
}

function getInstanceOwner(item?: EvolutionInstanceEnvelope | null) {
  return item?.instance?.owner || item?.instance?.ownerJid || item?.owner || item?.ownerJid;
}

function getInstanceState(item?: EvolutionInstanceEnvelope | null) {
  return (
    item?.instance?.state ||
    item?.instance?.status ||
    item?.instance?.connectionStatus ||
    item?.state ||
    item?.status ||
    item?.connectionStatus ||
    "unknown"
  );
}

function shouldUseEventWebhookPaths(webhookUrl: string) {
  if (process.env.EVOLUTION_WEBHOOK_BY_EVENTS) {
    return process.env.EVOLUTION_WEBHOOK_BY_EVENTS !== "false";
  }
  return !webhookUrl.includes("/webhook/");
}

export function getEvolutionConfig(context: EvolutionContext = {}): EvolutionConfig {
  const baseUrl = cleanUrl(process.env.EVOLUTION_API_BASE_URL?.trim() || "http://localhost:8080");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || "";
  const accountKey = normalizeAccountKey(context.accountKey);
  const instanceName = getUserEvolutionInstanceName(context.userEmail, accountKey);
  const appUrl = cleanUrl(process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000");
  const baseInstanceToken = process.env.EVOLUTION_INSTANCE_TOKEN?.trim() || instanceName;
  const instanceToken = context.userEmail
    ? hashValue(`${baseInstanceToken}:${context.userEmail.trim().toLowerCase()}:${accountKey}`, 64)
    : baseInstanceToken;

  return {
    baseUrl,
    apiKey,
    instanceName,
    instanceToken,
    webhookUrl:
      process.env.EVOLUTION_WEBHOOK_URL?.trim() ||
      `${appUrl}/api/webhooks/evolution`,
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || "",
    autoBootstrap: process.env.EVOLUTION_AUTO_BOOTSTRAP !== "false",
  };
}

export function isEvolutionConfigured(config = getEvolutionConfig()) {
  return !PLACEHOLDER_VALUES.has(config.baseUrl) && !PLACEHOLDER_VALUES.has(config.apiKey);
}

async function evolutionRequest<T>(
  path: string,
  init: RequestInit = {},
  config = getEvolutionConfig(),
) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.response?.message?.[0] ||
      payload?.response?.message ||
      payload?.message ||
      `Evolution API request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

async function fetchInstance(config: EvolutionConfig) {
  const query = new URLSearchParams({ instanceName: config.instanceName });
  let payload: EvolutionInstanceEnvelope[] | EvolutionInstanceEnvelope;

  try {
    payload = await evolutionRequest<EvolutionInstanceEnvelope[] | EvolutionInstanceEnvelope>(
      `/instance/fetchInstances?${query.toString()}`,
      {},
      config,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not found")) {
      return null;
    }
    throw error;
  }

  const items = Array.isArray(payload) ? payload : [payload];
  return items.find((item) => getInstanceName(item) === config.instanceName) ?? null;
}

async function createInstance(config: EvolutionConfig) {
  const webhookByEvents = shouldUseEventWebhookPaths(config.webhookUrl);
  return evolutionRequest<EvolutionCreateResponse>(
    "/instance/create",
    {
      method: "POST",
      body: JSON.stringify({
        instanceName: config.instanceName,
        integration: "WHATSAPP-BAILEYS",
        token: config.instanceToken,
        qrcode: true,
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: true,
        webhook: {
          enabled: true,
          url: config.webhookUrl,
          byEvents: webhookByEvents,
          webhook_by_events: webhookByEvents,
          base64: true,
          webhook_base64: true,
          headers: config.webhookSecret
            ? { authorization: `Bearer ${config.webhookSecret}` }
            : undefined,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "SEND_MESSAGE"],
        },
      }),
    },
    config,
  );
}

async function setInstanceWebhook(config: EvolutionConfig) {
  const webhookByEvents = shouldUseEventWebhookPaths(config.webhookUrl);
  return evolutionRequest(
    `/webhook/set/${encodeURIComponent(config.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: config.webhookUrl,
          byEvents: webhookByEvents,
          webhook_by_events: webhookByEvents,
          base64: true,
          webhook_base64: true,
          headers: config.webhookSecret
            ? { authorization: `Bearer ${config.webhookSecret}` }
            : undefined,
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "SEND_MESSAGE"],
        },
      }),
    },
    config,
  );
}

async function ensureInstance(config: EvolutionConfig) {
  const existing = await fetchInstance(config);
  if (existing) {
    await setInstanceWebhook(config);
    return { instance: existing, created: null };
  }

  const created = await createInstance(config);
  const instance = await fetchInstance(config).catch(() => null);
  return { instance, created };
}

async function connectionState(config: EvolutionConfig) {
  const cacheKey = config.instanceName;
  const cached = connectionStateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  try {
    const payload = await evolutionRequest<{ instance?: { state?: string; status?: string } }>(
      `/instance/connectionState/${encodeURIComponent(config.instanceName)}`,
      {},
      config,
    );
    const state = payload.instance?.state || payload.instance?.status || "unknown";
    connectionStateCache.set(cacheKey, { expiresAt: Date.now() + CONNECTION_STATE_TTL_MS, state });
    return state;
  } catch {
    return "unknown";
  }
}

async function connectInstance(config: EvolutionConfig) {
  return evolutionRequest<EvolutionConnectionResponse>(
    `/instance/connect/${encodeURIComponent(config.instanceName)}`,
    {},
    config,
  );
}

async function logoutInstance(config: EvolutionConfig) {
  return evolutionRequest<unknown>(
    `/instance/logout/${encodeURIComponent(config.instanceName)}`,
    {
      method: "DELETE",
    },
    config,
  );
}

async function toQrImage(base64: string | null, rawCode: string | null) {
  if (base64?.startsWith("data:image")) return base64;
  if (base64) return `data:image/png;base64,${base64}`;
  if (!rawCode) return null;
  return QRCode.toDataURL(rawCode, { margin: 1, width: 320 });
}

function pickConnectionQr(...responses: Array<EvolutionConnectionResponse | null | undefined>) {
  for (const response of responses) {
    const rawQrCode = response?.qrcode?.code || response?.code || null;
    const base64 = response?.qrcode?.base64 || response?.base64 || null;
    const pairingCode = response?.qrcode?.pairingCode || response?.pairingCode || null;
    const count = response?.qrcode?.count ?? response?.count ?? null;

    if (rawQrCode || base64 || pairingCode || count) {
      return { rawQrCode, base64, pairingCode, count };
    }
  }

  return { rawQrCode: null, base64: null, pairingCode: null, count: null };
}

function ownerToPhone(owner?: string) {
  if (!owner) return "";
  const number = owner.split("@")[0]?.replace(/\D/g, "");
  return number ? `+${number}` : "";
}

function getEvolutionTimestamp(value?: string | number | null) {
  if (!value) return null;
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
}

function formatEvolutionTimestamp(value?: string | number | null) {
  const date = getEvolutionTimestamp(value);
  if (!date) return "";

  const now = new Date();
  const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const isToday = dateKeyFormatter.format(date) === dateKeyFormatter.format(now);
  if (isToday) {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: APP_TIME_ZONE,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKeyFormatter.format(date) === dateKeyFormatter.format(yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: APP_TIME_ZONE,
  });
}

export function jidToPhone(jid?: string | null) {
  if (!jid) return "";
  const [rawId] = jid.split("@");
  if (!rawId) return jid;

  if (jid.endsWith("@s.whatsapp.net")) {
    const number = rawId.replace(/\D/g, "");
    return number ? `+${number}` : rawId;
  }

  return rawId;
}

function recipientFromJid(jid: string) {
  if (jid.endsWith("@s.whatsapp.net")) return jid.split("@")[0].replace(/\D/g, "");
  return jid;
}

function mediaTypeFromMime(mimetype: string): "image" | "video" | "audio" | "document" {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

function canonicalConversationJid(primaryJid?: string | null, alternateJid?: string | null) {
  const primary = primaryJid || "";
  const alternate = alternateJid || "";
  if (primary.endsWith("@lid") && alternate.endsWith("@s.whatsapp.net")) return alternate;
  return primary || alternate;
}

function readableMessageType(type?: string) {
  if (!type) return "Message";
  return type
    .replace(/Message$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

export function extractEvolutionMessageText(record?: EvolutionMessageRecord | null) {
  const message = record?.message;
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.documentMessage?.fileName ||
    message.templateMessage?.hydratedTemplate?.hydratedContentText ||
    message.interactiveMessage?.body?.text ||
    (message.imageMessage ? "[Image]" : "") ||
    (message.videoMessage ? "[Video]" : "") ||
    (message.documentMessage ? "[Document]" : "") ||
    (message.audioMessage ? "[Audio]" : "") ||
    (message.stickerMessage ? "[Sticker]" : "") ||
    (message.locationMessage ? "[Location]" : "") ||
    (message.contactMessage || message.contactsArrayMessage ? "[Contact]" : "") ||
    `[${readableMessageType(record?.messageType)}]`
  );
}

function jpegThumbnailToDataUrl(thumbnail?: string) {
  if (!thumbnail) return undefined;
  if (thumbnail.startsWith("data:")) return thumbnail;
  return `data:image/jpeg;base64,${thumbnail}`;
}

function getMediaContent(message?: EvolutionMessageContent) {
  return message?.imageMessage || message?.videoMessage || message?.documentMessage;
}

function isSelfLabel(name: string) {
  return ["voce", "você", "you", "me"].includes(name.toLowerCase());
}

function isNumericLabel(name: string) {
  return /^\+?\d{5,}$/.test(name.replace(/\s/g, ""));
}

function cleanDisplayName(name?: string | null) {
  const value = name?.trim() || "";
  if (!value || isSelfLabel(value) || isNumericLabel(value)) return "";
  return value;
}

function pickDisplayName(...names: Array<string | null | undefined>) {
  for (const name of names) {
    const cleaned = cleanDisplayName(name);
    if (cleaned) return cleaned;
  }

  return "";
}

function getContactName(contact?: EvolutionContactRecord | null) {
  return pickDisplayName(
    contact?.name,
    contact?.contactName,
    contact?.verifiedName,
    contact?.pushName,
    contact?.notify,
    contact?.shortName,
  );
}

function getContactAvatar(contact?: EvolutionContactRecord | null) {
  return contact?.profilePicUrl || contact?.profilePictureUrl || contact?.imgUrl || undefined;
}

function getPresenceStatus(...items: Array<EvolutionChatRecord | EvolutionContactRecord | null | undefined>) {
  for (const item of items) {
    const presence = item?.presence?.toLowerCase() || item?.lastPresence?.toLowerCase() || "";
    if ("composing" in (item || {}) && (item as EvolutionChatRecord).composing) return "typing";
    if (presence.includes("composing") || presence.includes("typing")) return "typing";
    if (item?.isOnline || presence === "available" || presence === "online") return "online";
  }

  return "offline";
}

async function fetchEvolutionContacts(config: EvolutionConfig) {
  try {
    const payload = await evolutionRequest<EvolutionContactRecord[] | { contacts?: EvolutionContactRecord[]; records?: EvolutionContactRecord[] }>(
      `/chat/findContacts/${encodeURIComponent(config.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      config,
    );

    const contacts = Array.isArray(payload) ? payload : payload.contacts || payload.records || [];
    return new Map(
      contacts
        .map((contact) => ({ ...contact, remoteJid: contact.remoteJid || contact.id }))
        .filter((contact) => contact.remoteJid)
        .map((contact) => [contact.remoteJid as string, contact]),
    );
  } catch {
    return new Map<string, EvolutionContactRecord>();
  }
}

function getRelatedChatJids(chat: EvolutionChatRecord) {
  return [
    chat.remoteJid,
    chat.lastMessage?.key?.remoteJid,
    chat.lastMessage?.key?.remoteJidAlt,
  ].filter((jid): jid is string => Boolean(jid));
}

function mapEvolutionChat(
  chat: EvolutionChatRecord,
  contacts: Map<string, EvolutionContactRecord>,
): ConversationRecord | null {
  const remoteJid = chat.remoteJid || chat.lastMessage?.key?.remoteJid || "";
  if (!remoteJid || remoteJid === "status@broadcast") return null;

  const canonicalJid = canonicalConversationJid(remoteJid, chat.lastMessage?.key?.remoteJidAlt);
  if (!canonicalJid || canonicalJid === "status@broadcast") return null;

  const isGroup = remoteJid.endsWith("@g.us");
  const contact = contacts.get(remoteJid);
  const canonicalContact = contacts.get(canonicalJid);
  const alternateContact = contacts.get(chat.lastMessage?.key?.remoteJidAlt || "");
  const fallbackName = jidToPhone(canonicalJid) || jidToPhone(remoteJid) || canonicalJid;
  const customerName = getContactName(canonicalContact) ||
    getContactName(contact) ||
    getContactName(alternateContact) ||
    pickDisplayName(
      chat.name,
      chat.contactName,
      chat.verifiedName,
      chat.pushName,
      chat.notify,
      chat.lastMessage?.name,
      chat.lastMessage?.senderName,
      chat.lastMessage?.pushName,
    ) ||
    (isGroup
      ? `Group ${fallbackName}`
      : fallbackName);
  const avatar =
    chat.profilePicUrl ||
    getContactAvatar(canonicalContact) ||
    getContactAvatar(contact) ||
    getContactAvatar(alternateContact);
  const relatedJids = Array.from(new Set(getRelatedChatJids(chat)));
  const lastMessage = extractEvolutionMessageText(chat.lastMessage) || "No messages yet";
  const timestamp =
    formatEvolutionTimestamp(chat.lastMessage?.messageTimestamp) ||
    formatEvolutionTimestamp(chat.updatedAt) ||
    "";
  const lastMessageAt =
    getEvolutionTimestamp(chat.lastMessage?.messageTimestamp)?.getTime() ||
    getEvolutionTimestamp(chat.updatedAt)?.getTime() ||
    0;
  const unread = Math.max(0, Number(chat.unreadCount || 0));

  return {
    id: canonicalJid,
    customerId: canonicalJid,
    customerName,
    phone: isGroup ? canonicalJid : jidToPhone(canonicalJid),
    avatar,
    lastMessage,
    timestamp,
    lastMessageAt,
    unread,
    status: getPresenceStatus(chat, canonicalContact, contact, alternateContact),
    conversationStatus: unread > 0 ? "open" : "pending",
    tags: [isGroup ? "Group" : "WhatsApp"],
    assignedAgent: undefined,
    source: "evolution",
    isGroup,
    relatedJids,
  };
}

function mergeEvolutionChats(chats: ConversationRecord[]) {
  const merged = new Map<string, ConversationRecord>();

  for (const chat of chats) {
    const existing = merged.get(chat.id);
    if (!existing) {
      merged.set(chat.id, chat);
      continue;
    }

    const relatedJids = Array.from(new Set([...(existing.relatedJids || []), ...(chat.relatedJids || [])]));
    const existingHasFallbackName =
      existing.customerName === existing.phone || isNumericLabel(existing.customerName);
    const nextHasBetterName = !isNumericLabel(chat.customerName) && chat.customerName !== chat.phone;
    const useNextLastMessage = (chat.lastMessageAt || 0) > (existing.lastMessageAt || 0);

    merged.set(chat.id, {
      ...existing,
      customerName: existingHasFallbackName && nextHasBetterName ? chat.customerName : existing.customerName,
      avatar: existing.avatar || chat.avatar,
      lastMessage: useNextLastMessage ? chat.lastMessage : existing.lastMessage,
      timestamp: useNextLastMessage ? chat.timestamp : existing.timestamp,
      lastMessageAt: Math.max(existing.lastMessageAt || 0, chat.lastMessageAt || 0),
      unread: existing.unread + chat.unread,
      conversationStatus:
        existing.conversationStatus === "open" || chat.conversationStatus === "open"
          ? "open"
          : existing.conversationStatus,
      relatedJids,
    });
  }

  return Array.from(merged.values());
}

function mapEvolutionMessage(record: EvolutionMessageRecord, fallbackJid: string): Message {
  const remoteJid = canonicalConversationJid(record.key?.remoteJid, record.key?.remoteJidAlt) || fallbackJid;
  const content = extractEvolutionMessageText(record) || `[${readableMessageType(record.messageType)}]`;
  const messageType = record.messageType?.toLowerCase() || "";
  const media = getMediaContent(record.message);
  const type: Message["type"] =
    messageType.includes("image") || Boolean(record.message?.imageMessage)
      ? "image"
      : messageType.includes("document") ||
          messageType.includes("file") ||
          messageType.includes("video") ||
          Boolean(record.message?.documentMessage) ||
          Boolean(record.message?.videoMessage)
        ? "file"
        : "text";
  const mediaUrl = type !== "text" && record.key?.id
    ? `/api/messages/media/${encodeURIComponent(record.key.id)}?${new URLSearchParams({
        remoteJid,
        fromMe: String(Boolean(record.key?.fromMe)),
        ...(record.key?.participant ? { participant: record.key.participant } : {}),
      }).toString()}`
    : undefined;
  const status = record.status?.toLowerCase();
  const deliveryStatus: Message["deliveryStatus"] = record.key?.fromMe
    ? status?.includes("read")
      ? "read"
      : status?.includes("deliver")
        ? "delivered"
        : "sent"
    : undefined;

  return {
    id: record.key?.id || record.id || `${remoteJid}-${record.messageTimestamp || Date.now()}`,
    contactId: remoteJid,
    content,
    timestamp: formatEvolutionTimestamp(record.messageTimestamp),
    sender: record.key?.fromMe ? "agent" : "customer",
    senderName: record.key?.fromMe ? "You" : pickDisplayName(record.name, record.senderName, record.pushName) || undefined,
    type,
    mediaUrl,
    thumbnailUrl: jpegThumbnailToDataUrl(media?.jpegThumbnail),
    mediaMimeType: media?.mimetype,
    fileName: media?.fileName,
    deliveryStatus,
  };
}

async function getRelatedEvolutionJids(config: EvolutionConfig, remoteJid: string) {
  const cacheKey = config.instanceName;
  const cached = rawChatCache.get(cacheKey);
  let chats: EvolutionChatRecord[];

  if (cached && cached.expiresAt > Date.now()) {
    chats = cached.chats;
  } else {
    chats = await evolutionRequest<EvolutionChatRecord[]>(
      `/chat/findChats/${encodeURIComponent(config.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      config,
    ).catch(() => []);

    if (chats.length) {
      rawChatCache.set(cacheKey, {
        expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
        chats,
      });
    }
  }

  const related = new Set<string>([remoteJid]);
  for (const chat of chats) {
    const canonicalJid = canonicalConversationJid(chat.remoteJid, chat.lastMessage?.key?.remoteJidAlt);
    const jids = getRelatedChatJids(chat);
    if (canonicalJid === remoteJid || jids.includes(remoteJid)) {
      jids.forEach((jid) => {
        if (jid !== "status@broadcast") related.add(jid);
      });
    }
  }

  return Array.from(related);
}

export async function isEvolutionInstanceOpen(context: EvolutionContext = {}) {
  const config = getEvolutionConfig(context);
  if (!isEvolutionConfigured(config)) return false;
  return (await connectionState(config)) === "open";
}

export async function listEvolutionChats(
  context: EvolutionContext = {},
  options: EvolutionPageOptions = {},
): Promise<PaginatedResult<ConversationRecord>> {
  const config = getEvolutionConfig(context);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 50);
  const page = Math.max(options.page ?? 1, 1);
  if (!isEvolutionConfigured(config)) return { items: [], nextCursor: null, hasMore: false };
  if ((await connectionState(config)) !== "open") return { items: [], nextCursor: null, hasMore: false };

  const cacheKey = config.instanceName;
  const cached = chatCache.get(cacheKey);
  let allItems = cached && cached.expiresAt > Date.now() ? cached.items : null;

  if (!allItems) {
    const [payload, contacts] = await Promise.all([
      evolutionRequest<EvolutionChatRecord[]>(
        `/chat/findChats/${encodeURIComponent(config.instanceName)}`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
        config,
      ),
      fetchEvolutionContacts(config),
    ]);

    rawChatCache.set(cacheKey, {
      expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
      chats: payload,
    });

    allItems = mergeEvolutionChats(
      payload
        .map((chat) => mapEvolutionChat(chat, contacts))
        .filter((chat): chat is ConversationRecord => Boolean(chat)),
    ).sort((a, b) => {
      const aUnread = a.unread > 0 ? 1 : 0;
      const bUnread = b.unread > 0 ? 1 : 0;
      return bUnread - aUnread || (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
    });

    chatCache.set(cacheKey, {
      expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
      items: allItems,
    });
  }

  const start = (page - 1) * limit;
  const items = allItems.slice(start, start + limit);
  const hasMore = start + limit < allItems.length;

  return {
    items,
    nextCursor: hasMore ? String(page + 1) : null,
    hasMore,
  };
}

async function fetchEvolutionMessages(
  config: EvolutionConfig,
  remoteJid: string,
  options: EvolutionPageOptions = {},
) {
  const page = Math.max(options.page ?? 1, 1);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 50);
  const requestBodies = [
    { where: { key: { remoteJid } }, page, offset: limit },
    { where: { remoteJid }, page, offset: limit },
    { page, offset: limit },
  ];

  for (const body of requestBodies) {
    try {
      const payload = await evolutionRequest<EvolutionFindMessagesResponse>(
        `/chat/findMessages/${encodeURIComponent(config.instanceName)}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        config,
      );
      const records = payload.messages?.records || payload.records || [];
      const filtered = records.filter((record) =>
        record.key?.remoteJid === remoteJid || record.key?.remoteJidAlt === remoteJid,
      );
      if (filtered.length) return filtered;
    } catch {
      // Try the next supported query shape. Evolution versions differ here.
    }
  }

  return [];
}

async function findEvolutionMessageById(
  config: EvolutionConfig,
  messageId: string,
  remoteJid?: string,
) {
  const jids = remoteJid ? await getRelatedEvolutionJids(config, remoteJid) : [""];
  const batches = await Promise.all(
    jids.map((jid) => (jid ? fetchEvolutionMessages(config, jid) : fetchEvolutionMessages(config, ""))),
  );

  return batches
    .flat()
    .find((record) => record.key?.id === messageId || record.id === messageId);
}

export async function getEvolutionChatMessages(
  remoteJid: string,
  context: EvolutionContext = {},
  options: EvolutionPageOptions = {},
): Promise<PaginatedResult<Message>> {
  const config = getEvolutionConfig(context);
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 50);
  const page = Math.max(options.page ?? 1, 1);
  if (!isEvolutionConfigured(config)) return { items: [], nextCursor: null, hasMore: false };
  if ((await connectionState(config)) !== "open") return { items: [], nextCursor: null, hasMore: false };

  const relatedJids = await getRelatedEvolutionJids(config, remoteJid);
  const recordGroups = await Promise.all(
    relatedJids.map((jid) => fetchEvolutionMessages(config, jid, { page, limit })),
  );
  const seen = new Set<string>();
  const records = recordGroups.flat().filter((record) => {
    const id = record.key?.id || record.id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const items = records
    .sort((a, b) => {
      const first = getEvolutionTimestamp(a.messageTimestamp)?.getTime() ?? 0;
      const second = getEvolutionTimestamp(b.messageTimestamp)?.getTime() ?? 0;
      return first - second;
    })
    .map((record) => mapEvolutionMessage(record, remoteJid));

  return {
    items,
    nextCursor: items.length >= limit ? String(page + 1) : null,
    hasMore: items.length >= limit,
  };
}

export async function getEvolutionMedia(
  messageId: string,
  key: EvolutionMediaKey = {},
  context: EvolutionContext = {},
) {
  const config = getEvolutionConfig(context);
  if (!isEvolutionConfigured(config)) {
    throw new Error("Evolution API is not configured.");
  }

  const mediaKey = {
    id: messageId,
    ...(key.remoteJid ? { remoteJid: key.remoteJid } : {}),
    ...(typeof key.fromMe === "boolean" ? { fromMe: key.fromMe } : {}),
    ...(key.participant ? { participant: key.participant } : {}),
  };
  const storedMessage = await findEvolutionMessageById(config, messageId, key.remoteJid).catch(() => null);
  const requestMessages = [
    storedMessage,
    { key: storedMessage?.key || mediaKey, message: storedMessage?.message },
    { key: mediaKey },
  ].filter(Boolean);

  let payload: EvolutionMediaResponse | null = null;
  let lastError: unknown = null;

  for (const message of requestMessages) {
    try {
      payload = await evolutionRequest<EvolutionMediaResponse>(
        `/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instanceName)}`,
        {
          method: "POST",
          body: JSON.stringify({
            message,
            convertToMp4: false,
          }),
        },
        config,
      );
      if (payload.base64) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!payload?.base64) {
    if (lastError instanceof Error) throw lastError;
    throw new Error("Evolution did not return media data.");
  }

  return {
    fileName: payload.fileName || `${messageId}.jpg`,
    mimetype: payload.mimetype || "application/octet-stream",
    buffer: Buffer.from(payload.base64.replace(/^data:.*;base64,/, ""), "base64"),
  };
}

export async function sendEvolutionTextMessage(
  remoteJid: string,
  text: string,
  context: EvolutionContext = {},
) {
  const config = getEvolutionConfig(context);
  if (!isEvolutionConfigured(config)) {
    throw new Error("Evolution API is not configured.");
  }
  if ((await connectionState(config)) !== "open") {
    throw new Error("Evolution WhatsApp instance is not connected.");
  }

  const payload = await evolutionRequest<EvolutionMessageRecord>(
    `/message/sendText/${encodeURIComponent(config.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: recipientFromJid(remoteJid),
        text,
        linkPreview: true,
      }),
    },
    config,
  );

  return mapEvolutionMessage(payload, remoteJid);
}

export async function sendEvolutionMediaMessage(
  remoteJid: string,
  media: EvolutionOutboundMedia,
  context: EvolutionContext = {},
) {
  const config = getEvolutionConfig(context);
  if (!isEvolutionConfigured(config)) {
    throw new Error("Evolution API is not configured.");
  }
  if ((await connectionState(config)) !== "open") {
    throw new Error("Evolution WhatsApp instance is not connected.");
  }

  const mediaType = mediaTypeFromMime(media.mimetype);
  const payload = await evolutionRequest<EvolutionMessageRecord>(
    `/message/sendMedia/${encodeURIComponent(config.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: recipientFromJid(remoteJid),
        mediatype: mediaType,
        mimetype: media.mimetype,
        caption: media.caption || "",
        media: media.base64,
        fileName: media.fileName,
      }),
    },
    config,
  );

  const message = mapEvolutionMessage(payload, remoteJid);
  return {
    ...message,
    content: media.caption || message.content || (mediaType === "image" ? "[Image]" : media.fileName),
    type: mediaType === "image" ? "image" : "file",
    mediaMimeType: media.mimetype,
    fileName: media.fileName,
    thumbnailUrl: mediaType === "image" ? `data:${media.mimetype};base64,${media.base64}` : message.thumbnailUrl,
  } satisfies Message;
}

export async function connectEvolutionInstance(
  context: EvolutionContext = {},
): Promise<EvolutionConnectionResult> {
  const config = getEvolutionConfig(context);
  const lastCheckedAt = new Date().toISOString();

  if (!isEvolutionConfigured(config)) {
    return {
      configured: false,
      instanceName: config.instanceName,
      baseUrl: config.baseUrl,
      state: "not_configured",
      connected: false,
      qrCode: null,
      rawQrCode: null,
      pairingCode: null,
      qrCount: null,
      businessNumber: "",
      webhookUrl: config.webhookUrl,
      lastCheckedAt,
      message: "Set EVOLUTION_API_BASE_URL and EVOLUTION_API_KEY to enable Evolution API.",
    };
  }

  const { instance, created } = await ensureInstance(config);
  const state = (await connectionState(config)) || getInstanceState(instance);
  const connected = state === "open";
  const connection = connected ? null : await connectInstance(config);
  const qr = pickConnectionQr(connection, created);
  const qrCode = await toQrImage(qr.base64, qr.rawQrCode);

  return {
    configured: true,
    instanceName: config.instanceName,
    baseUrl: config.baseUrl,
    state,
    connected,
    qrCode,
    rawQrCode: qr.rawQrCode,
    pairingCode: qr.pairingCode,
    qrCount: qr.count,
    businessNumber: ownerToPhone(getInstanceOwner(instance)),
    webhookUrl: config.webhookUrl,
    lastCheckedAt,
    message: connected
      ? "Evolution instance is connected."
      : qrCode
        ? "Scan the QR code from WhatsApp > Linked devices."
        : "Evolution instance is ready, but no QR code was returned yet. Try refresh in a few seconds.",
  };
}

export async function getEvolutionStatus(
  context: EvolutionContext = {},
): Promise<EvolutionConnectionResult> {
  const config = getEvolutionConfig(context);
  const lastCheckedAt = new Date().toISOString();

  if (!isEvolutionConfigured(config)) {
    return {
      configured: false,
      instanceName: config.instanceName,
      baseUrl: config.baseUrl,
      state: "not_configured",
      connected: false,
      qrCode: null,
      rawQrCode: null,
      pairingCode: null,
      qrCount: null,
      businessNumber: "",
      webhookUrl: config.webhookUrl,
      lastCheckedAt,
      message: "Evolution API is not configured.",
    };
  }

  const instance = await fetchInstance(config);
  const state = instance ? (await connectionState(config)) || getInstanceState(instance) : "missing";

  return {
    configured: true,
    instanceName: config.instanceName,
    baseUrl: config.baseUrl,
    state,
    connected: state === "open",
    qrCode: null,
    rawQrCode: null,
    pairingCode: null,
    qrCount: null,
    businessNumber: ownerToPhone(getInstanceOwner(instance)),
    webhookUrl: config.webhookUrl,
    lastCheckedAt,
    message: instance ? "Evolution status refreshed." : "Evolution instance has not been created yet.",
  };
}

export async function disconnectEvolutionInstance(
  context: EvolutionContext = {},
): Promise<EvolutionConnectionResult> {
  const config = getEvolutionConfig(context);
  const lastCheckedAt = new Date().toISOString();

  if (!isEvolutionConfigured(config)) {
    return {
      configured: false,
      instanceName: config.instanceName,
      baseUrl: config.baseUrl,
      state: "not_configured",
      connected: false,
      qrCode: null,
      rawQrCode: null,
      pairingCode: null,
      qrCount: null,
      businessNumber: "",
      webhookUrl: config.webhookUrl,
      lastCheckedAt,
      message: "Evolution API is not configured.",
    };
  }

  await logoutInstance(config);

  return {
    configured: true,
    instanceName: config.instanceName,
    baseUrl: config.baseUrl,
    state: "close",
    connected: false,
    qrCode: null,
    rawQrCode: null,
    pairingCode: null,
    qrCount: null,
    businessNumber: "",
    webhookUrl: config.webhookUrl,
    lastCheckedAt,
    message: "Evolution instance disconnected.",
  };
}

export async function bootstrapEvolutionOnStartup() {
  const config = getEvolutionConfig();
  if (!config.autoBootstrap || !isEvolutionConfigured(config)) return;

  try {
    await connectEvolutionInstance();
    console.info(`[Evolution] Instance "${config.instanceName}" is ready at ${config.baseUrl}.`);
  } catch (error) {
    console.warn(
      `[Evolution] Startup bootstrap skipped: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
