"use client";

import { useState } from "react";
import { Button } from "@tripme/ui";
import { useSupabaseClient } from "@tripme/supabase";
import { subscribeToPush } from "@/lib/push";

export function NotificationOptIn({ userId }: { userId: string }) {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  async function handleClick() {
    setIsSubscribing(true);
    const result = await subscribeToPush(supabase, userId);
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
