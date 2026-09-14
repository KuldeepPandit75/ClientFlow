"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import type { ConversationRecord, Message } from "@/lib/backend/types";

/**
 * A lightweight in-memory cache for inbox data that lives at the AppShell level.
 * When the user navigates away from /inbox and back, the Inbox component can
 * hydrate from this cache instead of showing a full loading skeleton.
 */

export interface InboxSnapshot {
  conversations: ConversationRecord[];
  messages: Record<string, Message[]>;
  selectedContactId: string;
  conversationCursor: string | null;
  hasMoreConversations: boolean;
  messageCursors: Record<string, string | null>;
  hasMoreMessages: Record<string, boolean>;
  savedAt: number;
}

interface InboxCacheContextValue {
  get: () => InboxSnapshot | null;
  set: (snapshot: InboxSnapshot) => void;
  clear: () => void;
}

const InboxCacheContext = createContext<InboxCacheContextValue | null>(null);

const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export function InboxCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<InboxSnapshot | null>(null);

  const get = useCallback((): InboxSnapshot | null => {
    const snapshot = cacheRef.current;
    if (!snapshot) return null;
    // Expire if older than 5 minutes
    if (Date.now() - snapshot.savedAt > CACHE_MAX_AGE_MS) {
      cacheRef.current = null;
      return null;
    }
    return snapshot;
  }, []);

  const set = useCallback((snapshot: InboxSnapshot) => {
    cacheRef.current = snapshot;
  }, []);

  const clear = useCallback(() => {
    cacheRef.current = null;
  }, []);

  return (
    <InboxCacheContext.Provider value={{ get, set, clear }}>
      {children}
    </InboxCacheContext.Provider>
  );
}

export function useInboxCache() {
  return useContext(InboxCacheContext);
}
