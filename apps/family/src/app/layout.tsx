import type { Metadata, Viewport } from "next";
import { Logo } from "@tripme/ui";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tripme",
  description: "Track your child's school bus, live.",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#3866d6",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-neutral-200 bg-white px-6 py-3">
          <Logo size="sm" />
        </header>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
