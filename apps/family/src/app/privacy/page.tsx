import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SabiDrive"
};

const LAST_UPDATED = "August 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10 text-neutral-700">
      <div>
        <h1 className="text-2xl font-semibold text-brand-800">Privacy Policy</h1>
        <p className="mt-1 text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
      </div>

      <p>
        SabiDrive is a school bus tracking and child safety app used by parents, drivers, and school
        administrators. This page explains what information the app collects, why, and how it&apos;s handled.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">Who has an account</h2>
        <p>
          Only parents/guardians, drivers, and school administrators create accounts and sign in. A student is
          never an account holder — their name, photo (optional), and attendance record are entered by their
          school&apos;s administrator or their guardian, not collected directly from the child through the app.
          Students identify themselves to a driver only via a printed/displayed QR code, which contains no
          personal information beyond an opaque identifier.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">Information we collect</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Account information</strong> — name, email, and (if you choose to verify it) phone number,
            for parents, drivers, and admins.
          </li>
          <li>
            <strong>Live location</strong> — a driver&apos;s device reports GPS position only while a trip they&apos;re
            actively driving is in progress. Location sharing stops the moment the trip ends.
          </li>
          <li>
            <strong>Attendance &amp; check-in events</strong> — when a student boards or is dropped off, recorded
            for the guardians and school to see.
          </li>
          <li>
            <strong>In-app messages</strong> — messages sent between a driver, guardians, and the school within a
            specific trip&apos;s conversation.
          </li>
          <li>
            <strong>Push notification tokens</strong> — if you enable notifications, a token identifying your
            device/browser so we can deliver alerts (e.g. your child boarded the bus).
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">How information is shared</h2>
        <p>
          Information about a student and their bus is visible only to that student&apos;s own school
          administrators and their linked guardians, and to the driver operating their bus during a trip. We do
          not sell personal information, and we do not share it with advertisers. A small number of service
          providers process data on our behalf, only for the purpose of running the app:
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Supabase</strong> — hosts the app&apos;s database, authentication, and file storage.
          </li>
          <li>
            <strong>Twilio</strong> — sends the real SMS code used to verify a phone number, and the optional SMS
            fallback for a small set of notification types (boarding, drop-off, emergency, announcements).
          </li>
          <li>
            <strong>Firebase Cloud Messaging</strong> — delivers push notifications to the Android app.
          </li>
          <li>
            <strong>OpenStreetMap</strong> — supplies map tiles and address search; no account data is sent to it,
            only the map area being viewed or the address text being searched.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">How long we keep information</h2>
        <p>Location and message history aren&apos;t kept indefinitely:</p>
        <ul className="list-disc pl-5">
          <li>Raw GPS location points are deleted after 14 days.</li>
          <li>Read notifications are deleted after 90 days.</li>
          <li>One-time SMS pickup codes are deleted within 1 day of being issued.</li>
        </ul>
        <p>
          Attendance and trip records are kept as the school&apos;s operational history, the same way a paper
          attendance log would be.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">Your choices</h2>
        <p>
          You can turn off push notifications for your device at any time from within the app. To remove a
          guardian, driver, or admin account, contact your school administrator — accounts are managed at the
          school level.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">Changes to this policy</h2>
        <p>
          If this policy changes in a way that affects how your information is handled, we&apos;ll update the
          date at the top of this page.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-neutral-900">Contact</h2>
        <p>Questions about this policy can be directed to your school&apos;s administrator.</p>
      </section>

      <Link href="/start" className="text-sm text-brand-700">
        ← Back to SabiDrive
      </Link>
    </main>
  );
}
