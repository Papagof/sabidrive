import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Thin native shell — no local web assets (see www/index.html, a required
 * but unused placeholder). Loads the live deployed family app directly, so
 * every redeploy to Hostinger shows up in the native app instantly with no
 * app-store resubmission needed. Existing installs only pick this up after
 * a rebuild (`npx cap sync android` + `gradlew assembleDebug`/`bundleRelease`).
 */
const config: CapacitorConfig = {
  appId: "com.sabidrive.family",
  appName: "SabiDrive",
  webDir: "www",
  server: {
    url: "https://family.sabidrive.com",
    androidScheme: "https"
  }
};

export default config;
