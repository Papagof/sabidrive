"use client";

import { useState, type FormEvent } from "react";
import { Banner, Button } from "@tripme/ui";
import { userQueries, useSupabaseClient } from "@tripme/supabase";

export interface InvitedUser {
  userId: string;
  full_name: string;
  email: string;
}

export interface InviteUserFormProps {
  role: "driver" | "parent";
  onInvited: (user: InvitedUser) => void;
  onCancel?: () => void;
}

export function InviteUserForm({ role, onInvited, onCancel }: InviteUserFormProps) {
  const supabase = useSupabaseClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const { userId } = await userQueries.inviteUser(supabase, {
        email,
        full_name: fullName,
        role,
        phone: phone || undefined
      });
      onInvited({ userId, full_name: fullName, email });
      setFullName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Full name"
        required
        className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="min-h-control rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
      />
      {error ? <Banner tone="caution" title="Couldn't send invite">{error}</Banner> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Sending..." : `Invite ${role}`}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
