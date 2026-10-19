"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  deepLink: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  createdAt: string;
  timeAgo: string;
};

/** Fired after notifications are marked read so the header bell refreshes immediately. */
export const NOTIFICATIONS_CHANGED_EVENT = "yurcore:notifications-changed";

export function emitNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function useNotifications(userId: string | undefined) {
  return useQuery<NotificationRow[]>(
    async () => {
      if (!userId) return [];
      const response = await apiClient<{ data: NotificationRow[] }>("/api/notification");
      return response.data;
    },
    [userId]
  );
}

export async function markNotificationReadApi(id: string) {
  return await apiClient("/api/notification", {
    method: "POST",
    body: JSON.stringify({ action: "markNotificationRead", payload: { id } }),
  });
}

export async function markAllNotificationsReadApi() {
  return await apiClient("/api/notification", {
    method: "POST",
    body: JSON.stringify({ action: "markAllNotificationsRead", payload: {} }),
  });
}
