import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Thin native shell — no local web assets (see www/index.html, a required
 * but unused placeholder). Loads the live deployed family app directly, so
 * every push to Vercel shows up in the native app instantly with no
 * app-store resubmission needed.
 */
const config: CapacitorConfig = {
  appId: "com.sabidrive.family",
  appName: "SabiDrive",
  webDir: "www",
  server: {
    url: "https://sabidrive-family.vercel.app",
    androidScheme: "https"
  }
};

export default config;
