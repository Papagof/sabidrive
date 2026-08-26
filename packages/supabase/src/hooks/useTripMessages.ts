"use client";

import { useEffect, useState } from "react";
import { useSupabaseClient } from "../context";

export interface TripMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

function toTripMessage(row: Record<string, unknown>): TripMessage {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    senderName: row.sender_name as string,
    body: row.body as string,
    createdAt: row.created_at as string
  };
}

/** Live per-trip message thread, updated via Supabase Realtime. Any trip participant (admin/driver/attendant/guardian) can read and post -- see can_view_trip() and 0034_trip_messages.sql. */
export function useTripMessages(tripId: string | null) {
  const supabase = useSupabaseClient();
  const [messages, setMessages] = useState<TripMessage[]>([]);

  useEffect(() => {
    if (!tripId) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    supabase
      .from("trip_messages")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (isMounted && data) setMessages(data.map(toTripMessage));
      });

    const channel = supabase
      .channel(`trip-messages-${tripId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trip_messages", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setMessages((prev) => [...prev, toTripMessage(payload.new as Record<string, unknown>)]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, tripId]);

  async function sendMessage(body: string) {
    if (!tripId) return;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("trip_messages").insert({ trip_id: tripId, sender_id: user.id, body });
    if (error) throw error;
  }

  return { messages, sendMessage };
}
