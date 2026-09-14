"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Check, CheckCheck, Search, Paperclip, Send, Smile, Phone, Video, Bot, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, apiSendForm } from "@/lib/api/client";
import { formatConversationTimestamp, formatMessageTimestamp } from "@/lib/format-timestamp";
import type { ConversationRecord, Message } from "@/lib/backend/types";

interface ImagePreview {
  src: string;
  alt: string;
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface NewMessagePopup {
  conversationId: string;
  customerName: string;
  content: string;
}

const CONVERSATION_PAGE_SIZE = 10;
const MESSAGE_PAGE_SIZE = 15;

function ChatListSkeleton() {
  const widths = ["w-32", "w-24", "w-36", "w-28", "w-34", "w-26", "w-30", "w-36"];
  return (
    <div className="animate-in fade-in duration-300">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-border/30 px-4 py-3.5"
        >
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className={`h-3.5 rounded ${widths[index]}`} />
              <Skeleton className="h-3 w-10 rounded" />
            </div>
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageLoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-primary/20" />
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <svg className="h-5 w-5 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/70">Loading messages</p>
        <p className="mt-1 text-xs text-muted-foreground">Fetching conversation history…</p>
      </div>
      {/* Skeleton message bubbles for context */}
      <div className="mt-4 w-full max-w-md space-y-3 px-4">
        <div className="flex justify-start">
          <Skeleton className="h-12 w-52 rounded-2xl rounded-tl-sm" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-44 rounded-2xl rounded-tr-sm" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-14 w-60 rounded-2xl rounded-tl-sm" />
        </div>
      </div>
    </div>
  );
}

export const Inbox = ({ title = "Inbox" }: { title?: string }) => {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [profileContactId, setProfileContactId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [composerHint, setComposerHint] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [messageCursors, setMessageCursors] = useState<Record<string, string | null>>({});
  const [hasMoreMessages, setHasMoreMessages] = useState<Record<string, boolean>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState<Record<string, boolean>>({});
  const [loadingMoreMessages, setLoadingMoreMessages] = useState<Record<string, boolean>>({});
  const [inboxError, setInboxError] = useState("");
  const [sendError, setSendError] = useState("");
  const [isSendingAttachment, setIsSendingAttachment] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [newMessagePopup, setNewMessagePopup] = useState<NewMessagePopup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messagesPaneRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousMessagesHeightRef = useRef<number | null>(null);
  const conversationsRef = useRef<ConversationRecord[]>([]);
  const selectedContactIdRef = useRef("");
  const isLoadingMoreConversationsRef = useRef(false);
  const seenMessageIdsRef = useRef<Record<string, Set<string>>>({});
  const seenConversationLastMessageRef = useRef<Record<string, string>>({});

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  useEffect(() => {
    let mounted = true;

    async function loadConversations() {
      try {
        const data = await apiGet<PaginatedResult<ConversationRecord>>(
          `/api/conversations?limit=${CONVERSATION_PAGE_SIZE}`,
        );
        if (!mounted) return;
        const previousLastMessages = seenConversationLastMessageRef.current;
        const changedConversation = data.items.find((conversation) => {
          const previous = previousLastMessages[conversation.id];
          return (
            previous &&
            previous !== conversation.lastMessage &&
            conversation.id !== selectedContactIdRef.current
          );
        });
        seenConversationLastMessageRef.current = {
          ...previousLastMessages,
          ...Object.fromEntries(
            data.items.map((conversation) => [conversation.id, conversation.lastMessage]),
          ),
        };
        if (changedConversation) {
          setNewMessagePopup({
            conversationId: changedConversation.id,
            customerName: changedConversation.customerName,
            content: changedConversation.lastMessage,
          });
        }
        setConversations((prev) => (prev.length ? upsertConversations(prev, data.items) : data.items));
        setConversationCursor(data.nextCursor);
        setHasMoreConversations(data.hasMore);
        setInboxError("");
        setSelectedContactId((current) => current || data.items[0]?.id || "");
      } catch (error) {
        if (!mounted) return;
        setInboxError(error instanceof Error ? error.message : "Could not load conversations.");
      } finally {
        if (mounted) setIsLoadingConversations(false);
      }
    }

    void loadConversations();
    const interval = window.setInterval(() => void loadConversations(), 12000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selectedContactId) return;
    let mounted = true;

    async function loadMessages() {
      const activeContactId = selectedContactId;
      setIsLoadingMessages((prev) => ({ ...prev, [activeContactId]: true }));
      try {
        const encodedId = encodeURIComponent(activeContactId);
        const data = await apiGet<PaginatedResult<Message>>(
          `/api/conversations/${encodedId}/messages?limit=${MESSAGE_PAGE_SIZE}`,
        );
        if (!mounted) return;
        seenMessageIdsRef.current[activeContactId] = new Set(data.items.map((message) => message.id));
        setMessages((prev) => ({
          ...prev,
          [activeContactId]: mergeMessages(prev[activeContactId] || [], data.items),
        }));
        setMessageCursors((prev) => ({ ...prev, [activeContactId]: data.nextCursor }));
        setHasMoreMessages((prev) => ({ ...prev, [activeContactId]: data.hasMore }));
        setInboxError("");
      } catch (error) {
        if (!mounted) return;
        setInboxError(error instanceof Error ? error.message : "Could not load messages.");
      } finally {
        if (mounted) {
          setIsLoadingMessages((prev) => ({ ...prev, [activeContactId]: false }));
        }
      }
    }

    void loadMessages();
    const interval = window.setInterval(() => void loadMessages(), 8000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [selectedContactId]);

  useEffect(() => {
    if (!imagePreview) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  const filteredContacts = useMemo(() => conversations.filter((c) =>
    c.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  ), [conversations, searchQuery]);

  const selectedContact = conversations.find((contact) => contact.id === selectedContactId) ?? filteredContacts[0];

  const currentMessages = selectedContact ? messages[selectedContact.id] || [] : [];
  const selectedMessagesLoading = selectedContact ? Boolean(isLoadingMessages[selectedContact.id]) : false;
  const showContactProfile = Boolean(selectedContact && profileContactId === selectedContact.id);

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      const element = messagesPaneRef.current;
      if (!element) return;
      element.scrollTo({ top: element.scrollHeight, behavior });
    });
  };

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scrollMessagesToBottom("auto");
  }, [selectedContactId]);

  useEffect(() => {
    const element = messagesPaneRef.current;
    if (!element || !selectedContact) return;

    if (previousMessagesHeightRef.current !== null) {
      const heightDifference = element.scrollHeight - previousMessagesHeightRef.current;
      element.scrollTop += heightDifference;
      previousMessagesHeightRef.current = null;
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollMessagesToBottom("smooth");
    }
  }, [currentMessages.length, selectedContact]);

  function mergeMessages(existing: Message[], next: Message[]) {
    const byId = new Map<string, Message>();
    [...existing, ...next].forEach((message) => {
      byId.set(message.id, { ...byId.get(message.id), ...message });
    });
    return Array.from(byId.values());
  }

  function upsertConversations(existing: ConversationRecord[], next: ConversationRecord[]) {
    const byId = new Map(existing.map((conversation) => [conversation.id, conversation]));
    next.forEach((conversation) => {
      byId.set(conversation.id, { ...byId.get(conversation.id), ...conversation });
    });
    return Array.from(byId.values());
  }

  const loadMoreConversations = async () => {
    if (
      !conversationCursor ||
      isLoadingMoreConversationsRef.current ||
      searchQuery
    ) {
      return;
    }
    isLoadingMoreConversationsRef.current = true;
    setIsLoadingMoreConversations(true);
    try {
      const requestedCursor = conversationCursor;
      const data = await apiGet<PaginatedResult<ConversationRecord>>(
        `/api/conversations?limit=${CONVERSATION_PAGE_SIZE}&cursor=${encodeURIComponent(requestedCursor)}`,
      );
      const existingIds = new Set(conversationsRef.current.map((conversation) => conversation.id));
      const addedCount = data.items.filter((conversation) => !existingIds.has(conversation.id)).length;
      setConversations((prev) => upsertConversations(prev, data.items));

      if (addedCount === 0 || !data.hasMore || data.nextCursor === requestedCursor) {
        setConversationCursor(null);
        setHasMoreConversations(false);
      } else {
        setConversationCursor(data.nextCursor);
        setHasMoreConversations(Boolean(data.nextCursor));
      }
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Could not load more conversations.");
    } finally {
      isLoadingMoreConversationsRef.current = false;
      setIsLoadingMoreConversations(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!selectedContact) return;
    const cursor = messageCursors[selectedContact.id];
    if (!cursor || loadingMoreMessages[selectedContact.id]) return;
    previousMessagesHeightRef.current = messagesPaneRef.current?.scrollHeight ?? null;
    shouldStickToBottomRef.current = false;
    setLoadingMoreMessages((prev) => ({ ...prev, [selectedContact.id]: true }));
    try {
      const encodedId = encodeURIComponent(selectedContact.id);
      const data = await apiGet<PaginatedResult<Message>>(
        `/api/conversations/${encodedId}/messages?limit=${MESSAGE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      setMessages((prev) => ({
        ...prev,
        [selectedContact.id]: mergeMessages(data.items, prev[selectedContact.id] || []),
      }));
      setMessageCursors((prev) => ({ ...prev, [selectedContact.id]: data.nextCursor }));
      setHasMoreMessages((prev) => ({ ...prev, [selectedContact.id]: data.hasMore }));
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Could not load older messages.");
    } finally {
      setLoadingMoreMessages((prev) => ({ ...prev, [selectedContact.id]: false }));
    }
  };

  const handleConversationScroll = () => {
    const element = chatListRef.current;
    if (!element) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 120 && hasMoreConversations && !isLoadingMoreConversationsRef.current) {
      void loadMoreConversations();
    }
  };

  const handleMessagesScroll = () => {
    const element = messagesPaneRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 140;
    if (element.scrollTop > 80) return;
    if (selectedContact && hasMoreMessages[selectedContact.id]) void loadMoreMessages();
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "WA";

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContact) return;
    const content = newMessage.trim();
    const tempId = `pending-${selectedContact.id}-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      contactId: selectedContact.id,
      content,
      timestamp: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }),
      sender: "agent",
      senderName: "You",
      type: "text",
      deliveryStatus: "pending",
    };

    setNewMessage("");
    setComposerHint("");
    setSendError("");
    shouldStickToBottomRef.current = true;
    appendSentMessage(optimisticMessage);
    scrollMessagesToBottom("smooth");

    try {
      const msg = await apiSend<Message>("/api/messages/send", "POST", {
        conversationId: selectedContact.id,
        content,
        senderName: "Akash",
      });

      replaceMessage(selectedContact.id, tempId, { ...msg, deliveryStatus: "sent" });
      await apiSend(`/api/conversations/${encodeURIComponent(selectedContact.id)}/read`, "PATCH");
    } catch (error) {
      replaceMessage(selectedContact.id, tempId, { ...optimisticMessage, deliveryStatus: "pending" });
      setSendError(error instanceof Error ? error.message : "Message could not be sent.");
    }
  };

  const appendSentMessage = (msg: Message) => {
    if (!selectedContact) return;

    setMessages((prev) => ({
      ...prev,
      [selectedContact.id]: [...(prev[selectedContact.id] || []), msg],
    }));
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === selectedContact.id
          ? { ...conversation, lastMessage: msg.content, timestamp: msg.timestamp }
          : conversation,
      ),
    );
  };

  const replaceMessage = (conversationId: string, temporaryId: string, message: Message) => {
    setMessages((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] || []).map((item) =>
        item.id === temporaryId ? message : item,
      ),
    }));
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessage: message.content, timestamp: message.timestamp }
          : conversation,
      ),
    );
  };

  const openAttachmentPicker = () => {
    setComposerHint("");
    setSendError("");
    fileInputRef.current?.click();
  };

  const handleAttachmentSelected = async (file: File | undefined) => {
    if (!file || !selectedContact) return;

    const caption = newMessage.trim();
    const form = new FormData();
    form.append("conversationId", selectedContact.id);
    form.append("senderName", "Akash");
    form.append("content", caption);
    form.append("file", file);

    setIsSendingAttachment(true);
    setSendError("");
    setComposerHint(`Sending ${file.name}...`);
    shouldStickToBottomRef.current = true;

    try {
      const msg = await apiSendForm<Message>("/api/messages/send", "POST", form);
      appendSentMessage(msg);
      scrollMessagesToBottom("smooth");
      await apiSend(`/api/conversations/${encodeURIComponent(selectedContact.id)}/read`, "PATCH");
      setNewMessage("");
      setComposerHint("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Attachment could not be sent.");
      setComposerHint("");
    } finally {
      setIsSendingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <DashboardLayout title={title}>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Chat List */}
        <div className="w-full md:w-[360px] border-r border-border flex flex-col bg-card">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-9 bg-secondary border-0 rounded-xl h-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div
            ref={chatListRef}
            onScroll={handleConversationScroll}
            className="flex-1 overflow-y-auto scrollbar-thin"
          >
            {isLoadingConversations ? (
              <ChatListSkeleton />
            ) : filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`group w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 border-b border-border/30 ${
                  selectedContact?.id === contact.id
                    ? "bg-primary/[0.07] border-l-2 border-l-primary"
                    : "hover:bg-secondary/60 border-l-2 border-l-transparent"
                }`}
              >
                <div className="relative shrink-0">
                  {contact.avatar ? (
                    <img src={contact.avatar} alt="" className="w-11 h-11 rounded-full object-cover bg-secondary ring-1 ring-border/40" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-secondary to-secondary/60 flex items-center justify-center text-foreground/80 font-semibold text-xs ring-1 ring-border/40">
                      {initials(contact.customerName)}
                    </div>
                  )}
                  {(contact.status === 'online' || contact.status === "typing") && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${contact.unread > 0 ? "font-bold" : "font-semibold"}`}>{contact.customerName}</p>
                    <span className={`text-[11px] flex-shrink-0 ${contact.unread > 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>{formatConversationTimestamp(contact.timestamp)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5 gap-2">
                    <p className={`text-xs truncate ${contact.unread > 0 ? "text-foreground/70 font-medium" : "text-muted-foreground"}`}>{contact.lastMessage}</p>
                    {contact.unread > 0 && (
                      <span className="flex-shrink-0 bg-primary text-primary-foreground text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                        {contact.unread > 99 ? "99+" : contact.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {!isLoadingConversations && filteredContacts.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground/70">
                  {searchQuery ? "No matching conversations" : "No chats yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {searchQuery ? "Try a different search term" : "Conversations will appear once WhatsApp syncs"}
                </p>
              </div>
            )}
            {isLoadingMoreConversations && (
              <div className="flex items-center justify-center gap-2 px-4 py-3">
                <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-muted-foreground">Loading more…</span>
              </div>
            )}
          </div>
        </div>

        {/* Chat Window */}
        {selectedContact ? (
        <div className="hidden md:flex flex-col flex-1 min-w-0">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-card/95 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setProfileContactId(selectedContact.id)}
              className="flex min-w-0 items-center gap-3 rounded-xl py-1 pr-4 text-left transition-colors hover:bg-secondary/60"
              title="View contact profile"
            >
              <div className="relative shrink-0">
                {selectedContact.avatar ? (
                  <img src={selectedContact.avatar} alt="" className="w-10 h-10 rounded-full object-cover bg-secondary ring-1 ring-border/40" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-secondary/60 flex items-center justify-center text-foreground/80 font-semibold text-xs ring-1 ring-border/40">
                    {initials(selectedContact.customerName)}
                  </div>
                )}
                {(selectedContact.status === "online" || selectedContact.status === "typing") && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selectedContact.customerName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedContact.status === "typing" ? (
                    <span className="text-emerald-600 font-medium">typing…</span>
                  ) : (
                    [selectedContact.phone, selectedContact.status === "online" ? "online" : ""]
                      .filter(Boolean)
                      .join(" · ")
                  )}
                </p>
              </div>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesPaneRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-chat-bg"
          >
            {inboxError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {inboxError}
              </div>
            )}
            {selectedContact && hasMoreMessages[selectedContact.id] && (
              <button
                type="button"
                onClick={() => void loadMoreMessages()}
                disabled={loadingMoreMessages[selectedContact.id]}
                className="mx-auto flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-border/30 transition-all hover:bg-card hover:shadow-md disabled:opacity-60"
              >
                {loadingMoreMessages[selectedContact.id] && (
                  <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {loadingMoreMessages[selectedContact.id] ? "Loading…" : "Load older messages"}
              </button>
            )}
            {!inboxError && selectedMessagesLoading && currentMessages.length === 0 && (
              <MessageLoadingState />
            )}
            {!inboxError && !selectedMessagesLoading && currentMessages.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border/30">
                  <Send className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">No messages yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Send a message to start the conversation</p>
                </div>
              </div>
            )}
            {currentMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[65%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.sender === 'customer'
                    ? 'bg-chat-incoming rounded-tl-sm'
                    : msg.sender === 'bot'
                    ? 'bg-accent rounded-tr-sm'
                    : 'bg-chat-outgoing rounded-tr-sm'
                }`}>
                  {msg.sender !== 'customer' && (
                    <div className="flex items-center gap-1 mb-0.5">
                      {msg.sender === 'bot' ? <Bot className="w-3 h-3 text-accent-foreground" /> : <User className="w-3 h-3 text-foreground" />}
                      <span className="text-[11px] font-semibold text-foreground">{msg.sender === 'bot' ? 'Bot' : msg.senderName}</span>
                    </div>
                  )}
                  {msg.type === "image" && (msg.mediaUrl || msg.thumbnailUrl) ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="block cursor-zoom-in rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        onClick={(event) =>
                          setImagePreview({
                            src:
                              event.currentTarget.querySelector("img")?.currentSrc ||
                              msg.mediaUrl ||
                              msg.thumbnailUrl ||
                              "",
                            alt: msg.content === "[Image]" ? "WhatsApp image" : msg.content,
                          })
                        }
                      >
                        <img
                          src={msg.mediaUrl || msg.thumbnailUrl}
                          alt={msg.content === "[Image]" ? "WhatsApp image" : msg.content}
                          className="max-h-80 w-full max-w-sm rounded-xl object-contain bg-background/40"
                          loading="lazy"
                          onError={(event) => {
                            if (msg.thumbnailUrl && event.currentTarget.src !== msg.thumbnailUrl) {
                              event.currentTarget.src = msg.thumbnailUrl;
                            }
                          }}
                        />
                      </button>
                      {msg.content && msg.content !== "[Image]" && (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  ) : msg.type === "file" && msg.mediaUrl ? (
                    <a
                      href={msg.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      {msg.fileName || msg.content}
                    </a>
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <span>{formatMessageTimestamp(msg.timestamp)}</span>
                    {msg.sender === "agent" && (
                      msg.deliveryStatus === "read" ? (
                        <CheckCheck className="h-3 w-3 text-sky-500" />
                      ) : msg.deliveryStatus === "delivered" || msg.deliveryStatus === "sent" ? (
                        <CheckCheck className="h-3 w-3" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="border-t border-border/60 bg-card/95 backdrop-blur-sm px-4 py-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setNewMessage((prev) => `${prev}🙂`)} className="p-2 rounded-lg hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground" title="Insert emoji"><Smile className="w-5 h-5" /></button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="hidden"
                onChange={(event) => void handleAttachmentSelected(event.target.files?.[0])}
              />
              <button
                onClick={openAttachmentPicker}
                disabled={isSendingAttachment}
                className="p-2 rounded-lg hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                title="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <Input
                placeholder="Type a message..."
                className="flex-1 bg-secondary/70 border-0 rounded-xl h-10 focus-visible:bg-secondary focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSend();
                }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={isSendingAttachment || !newMessage.trim()}
                className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            {composerHint && <p className="mt-2 text-xs text-muted-foreground animate-in fade-in duration-200">{composerHint}</p>}
            {sendError && <p className="mt-2 text-xs text-destructive animate-in fade-in duration-200">{sendError}</p>}
          </div>
        </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-4 bg-chat-bg">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border/30">
              <Search className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/60">No conversation selected</p>
              <p className="mt-1 text-xs text-muted-foreground">Select a chat from the sidebar or wait for WhatsApp to sync</p>
            </div>
          </div>
        )}
        {selectedContact && showContactProfile && (
          <aside className="hidden w-[340px] shrink-0 border-l border-border bg-card md:flex md:flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide">Contact Info</h2>
              <button
                type="button"
                onClick={() => setProfileContactId("")}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Close profile"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col items-center border-b border-border pb-6 text-center">
                {selectedContact.avatar ? (
                  <button
                    type="button"
                    onClick={() => setImagePreview({ src: selectedContact.avatar || "", alt: selectedContact.customerName })}
                    className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img
                      src={selectedContact.avatar}
                      alt={selectedContact.customerName}
                      className="h-28 w-28 rounded-full object-cover bg-secondary"
                    />
                  </button>
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-secondary text-2xl font-bold">
                    {initials(selectedContact.customerName)}
                  </div>
                )}
                <h3 className="mt-4 text-lg font-bold">{selectedContact.customerName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{selectedContact.phone || "No phone number"}</p>
                <p className="mt-2 rounded-full bg-secondary px-3 py-1 text-xs capitalize text-muted-foreground">
                  {selectedContact.status === "typing" ? "typing..." : selectedContact.status}
                </p>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Phone</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="break-all text-sm font-medium">{selectedContact.phone || "-"}</p>
                    {selectedContact.phone && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(selectedContact.phone)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        title="Copy phone"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Customer Source</p>
                  <p className="mt-2 text-sm font-medium capitalize">{selectedContact.source || "WhatsApp"}</p>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Assigned Agent</p>
                  <p className="mt-2 break-all text-sm font-medium">
                    {selectedContact.assignedAgentName || selectedContact.assignedAgent || "Unassigned"}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Last Message</p>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedContact.lastMessage || "-"}</p>
                </div>

                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedContact.tags.length ? selectedContact.tags : ["WhatsApp"]).map((tag) => (
                      <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {selectedContact.phone && (
                <button
                  type="button"
                  onClick={() => window.open(`https://wa.me/${selectedContact.phone.replace(/\D/g, "")}`, "_blank")}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Video className="h-4 w-4" />
                  Open WhatsApp
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
      {newMessagePopup && (
        <button
          type="button"
          onClick={() => {
            setSelectedContactId(newMessagePopup.conversationId);
            setNewMessagePopup(null);
          }}
          className="fixed right-6 top-6 z-40 w-80 rounded-xl border border-border bg-card p-4 text-left shadow-2xl transition-colors hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">New WhatsApp message</p>
              <p className="mt-1 truncate text-xs font-medium text-foreground">{newMessagePopup.customerName}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{newMessagePopup.content}</p>
            </div>
            <span
              className="rounded-full p-1 text-muted-foreground hover:bg-background"
              onClick={(event) => {
                event.stopPropagation();
                setNewMessagePopup(null);
              }}
            >
              <X className="h-4 w-4" />
            </span>
          </div>
        </button>
      )}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" role="dialog" aria-modal="true">
          <div className="relative max-h-full max-w-full">
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-background/95 p-2 text-foreground shadow-lg transition-colors hover:bg-background"
              title="Close image"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={imagePreview.src}
              alt={imagePreview.alt}
              className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Inbox;
