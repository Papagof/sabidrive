"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@sabidrive/ui";
import { useSupabaseClient } from "@sabidrive/supabase";
import { subscribeToPush } from "@/lib/push";
import { subscribeToNativePush } from "@/lib/nativePush";

export function NotificationOptIn({ userId }: { userId: string }) {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  async function handleClick() {
    setIsSubscribing(true);
    const result = Capacitor.isNativePlatform()
      ? await subscribeToNativePush(supabase, userId)
      : await subscribeToPush(supabase, userId);
    setStatus(
      result === "subscribed"
        ? "Notifications enabled."
        : result === "denied"
          ? "Notification permission denied."
          : result === "unsupported"
            ? "Push isn't supported in this browser."
            : "Something went wrong."
    );
    setIsSubscribing(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={handleClick} disabled={isSubscribing}>
        {isSubscribing ? "Enabling..." : "Enable notifications"}
      </Button>
      {status ? <span className="text-xs text-neutral-500">{status}</span> : null}
    </div>
  );
}
