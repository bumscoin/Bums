import type { AnnouncementOptions } from "./broadcast.js";

interface UserRecord {
  userId: number;
  username?: string;
  firstName?: string;
  registeredAt: number;
}

const users = new Map<number, UserRecord>();

export function registerUser(userId: number, firstName?: string, username?: string) {
  if (!users.has(userId)) {
    users.set(userId, { userId, firstName, username, registeredAt: Date.now() });
  }
}

export function getAllUsers(): UserRecord[] {
  return Array.from(users.values());
}

export function getUserCount(): number {
  return users.size;
}

// ── Inline share store ─────────────────────────────────────────────────────
// Keyed by admin Telegram user ID so concurrent admins don't conflict.
const pendingShares = new Map<number, AnnouncementOptions>();

export function setPendingShare(adminId: number, ann: AnnouncementOptions) {
  pendingShares.set(adminId, ann);
}

export function getPendingShare(adminId: number): AnnouncementOptions | undefined {
  return pendingShares.get(adminId);
}
