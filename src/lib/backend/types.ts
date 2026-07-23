export type PresenceStatus = "online" | "offline" | "away" | "typing";

export type UserRole = "super_admin" | "admin" | "sub_agent";
export type UserStatus = "active" | "disabled" | "pending";
export type MemberPermission =
  | "chat.view_all"
  | "chat.view_unassigned"
  | "chat.assign"
  | "template.manage"
  | "automation.manage"
  | "knowledge.manage"
  | "bulk.send"
  | "analytics.view"
  | "team.manage";
export type BusinessPlan = "free" | "starter" | "pro" | "enterprise";
export type BusinessStatus = "active" | "suspended" | "cancelled";

export interface Message {
  id: string;
  contactId: string;
  content: string;
  timestamp: string;
  sender: "customer" | "agent" | "bot";
  senderName?: string;
  type: "text" | "image" | "file";
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaMimeType?: string;
  fileName?: string;
  deliveryStatus?: "pending" | "sent" | "delivered" | "read";
}

export type ConversationStatus = "open" | "pending" | "closed";

export interface ConversationRecord {
  id: string;
  customerId: string;
  businessId?: string;
  customerName: string;
  phone: string;
  avatar?: string;
  lastMessage: string;
  timestamp: string;
  lastMessageAt?: number;
  unread: number;
  status: PresenceStatus;
  conversationStatus: ConversationStatus;
  tags: string[];
  assignedAgent?: string;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  accountKey?: string;
  source?: "evolution" | "manual";
  isGroup?: boolean;
  relatedJids?: string[];
}

export type WhatsAppProvider = "evolution";

export interface WhatsAppSettings {
  provider: WhatsAppProvider;
  connected: boolean;
  businessNumber: string;
  webhookUrl: string;
  cloudinaryEnabled: boolean;
  evolution?: {
    configured: boolean;
    instanceName: string;
    baseUrl: string;
    state: string;
    qrCode: string | null;
    rawQrCode: string | null;
    pairingCode: string | null;
    qrCount: number | null;
    lastCheckedAt: string | null;
    message: string | null;
  };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  businessId: string | null;
  status: UserStatus;
  permissions: MemberPermission[];
}

export interface StoredUser extends SessionUser {
  password: string;
}

export interface BackendState {
  whatsapp: WhatsAppSettings;
  currentUser: SessionUser;
  users: StoredUser[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
