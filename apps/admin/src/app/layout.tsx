import type { Metadata } from "next";
import { Logo } from "@sabidrive/ui";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SabiDrive Admin",
  description: "Fleet, routes, and attendance for school transport coordinators."
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
