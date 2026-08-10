"use client";

import { useEffect, useState } from "react";
import { useSupabaseClient } from "../context";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_trip_id: string | null;
  related_student_id: string | null;
  is_read: boolean;
  created_at: string;
}

/** Notification timeline for a recipient, live-updated as new rows arrive. */
export function useNotifications(recipientId: string | null) {
  const supabase = useSupabaseClient();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    if (!recipientId) {
      setNotifications([]);
      return;
    }

    let isMounted = true;

    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (isMounted && data) setNotifications(data as NotificationRow[]);
      });

    const channel = supabase
      .channel(`notifications-${recipientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${recipientId}` },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationRow, ...prev]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, recipientId]);

  async function markRead(notificationId: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
  }

  return { notifications, markRead };
}
