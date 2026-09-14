/**
 * Client-side timestamp formatting utility.
 *
 * Mirrors the server-side `formatEvolutionTimestamp` from
 * `src/lib/evolution/client.ts` so the UI always shows human-readable
 * relative dates instead of raw ISO strings.
 */

const TIME_ZONE = "Asia/Kolkata";

/** Parse a timestamp value that may be an ISO string, epoch seconds, or epoch ms. */
function parseTimestamp(value?: string | number | null): Date | null {
  if (!value) return null;

  if (typeof value === "string") {
    // If it looks numeric, treat it as an epoch
    if (!Number.isNaN(Number(value))) {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return new Date(n < 10_000_000_000 ? n * 1000 : n);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Date(value < 10_000_000_000 ? value * 1000 : value);
  }

  return null;
}

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
});

/**
 * Format a conversation-list timestamp into a short relative string.
 *
 * - Today → "14:32"
 * - Yesterday → "Yesterday"
 * - Older → "05 Aug"
 * - Already formatted (no ISO/epoch) → returned as-is
 */
export function formatConversationTimestamp(value?: string | number | null): string {
  if (!value) return "";

  const date = parseTimestamp(value);
  if (!date) {
    // Already a formatted string like "14:32" or "Yesterday" — pass through
    return String(value);
  }

  const now = new Date();
  const todayKey = dateKeyFmt.format(now);
  const dateKey = dateKeyFmt.format(date);

  if (dateKey === todayKey) {
    return timeFmt.format(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey === dateKeyFmt.format(yesterday)) {
    return "Yesterday";
  }

  return dateFmt.format(date);
}

/**
 * Format a message-level timestamp into a short time string.
 *
 * - Valid date → "14:32"
 * - Already formatted → returned as-is
 */
export function formatMessageTimestamp(value?: string | number | null): string {
  if (!value) return "";

  const date = parseTimestamp(value);
  if (!date) {
    return String(value);
  }

  return timeFmt.format(date);
}
