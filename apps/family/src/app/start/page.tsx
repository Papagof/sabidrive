import Link from "next/link";
import { AnimatedBusesBackdrop, Card, Logo } from "@sabidrive/ui";

const ADMIN_APP_URL = "https://admin.sabidrive.com";

export default function ChoosePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <AnimatedBusesBackdrop />

      <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-center backdrop-blur-sm">
        <Logo size="lg" />
        <p className="text-neutral-600">Track school buses, safely and live. Choose how you&apos;re signing in.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Link href="/login">
          <Card className="flex flex-col gap-1 transition hover:border-brand-300">
            <p className="text-lg font-medium text-brand-800">Parent or Driver</p>
            <p className="text-sm text-neutral-500">Track your child&apos;s bus, or run your route as a driver.</p>
          </Card>
        </Link>

        <a href={`${ADMIN_APP_URL}/login`}>
          <Card className="flex flex-col gap-1 transition hover:border-brand-300">
            <p className="text-lg font-medium text-brand-800">School Admin</p>
            <p className="text-sm text-neutral-500">Manage routes, buses, students, and staff for your school.</p>
          </Card>
        </a>
      </div>
    </main>
  );
}
