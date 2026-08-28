# Android Play Store submission checklist

Everything up to "create the Play Console listing" is built and verified. Past that point needs a real
Google Play Developer account (one-time $25 fee), which only you can create/access.

## 1. Generate your real release keystore (run this yourself, not through an AI session)

The release keystore is the app's permanent signing identity — losing it, or having its private key exposed,
is unlike losing an API key: it can't be rotated. Run this in your own terminal:

```
keytool -genkeypair -v -keystore sabidrive-release.jks -alias sabidrive -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password, a key password, and identity fields (name/org/etc. — these end up
in the certificate, not shown to end users). Use strong, unique passwords and store them in a password
manager — not in a text file next to the keystore.

**Store the `.jks` file somewhere safe outside the repo** (or anywhere already covered by `.gitignore` if you
keep it locally in this project — `apps/family-native/android/.gitignore` now ignores `*.jks`/`*.keystore`
either way, so it won't accidentally get committed).

## 2. Wire it into the build

Copy `apps/family-native/android/app/keystore.properties.example` to
`apps/family-native/android/app/keystore.properties` (already gitignored) and fill in the real values:

```
storeFile=/absolute/path/to/sabidrive-release.jks
storePassword=...
keyAlias=sabidrive
keyPassword=...
```

Once that file exists, `gradlew bundleRelease` (from `apps/family-native/android`) produces a *signed*
`app/build/outputs/bundle/release/app-release.aab` — this exact wiring was verified end-to-end with a
disposable throwaway keystore (never committed, never reused) before this checklist was written; your real
keystore just needs to exist at the path you point `keystore.properties` at.

## 3. Enroll in Play App Signing (strongly recommended)

When you create the app in Play Console and upload your first release, opt into **Play App Signing**. Google
then holds the *final* app-signing key, and the `.jks` you generated in step 1 becomes an *upload* key —
if you ever lose it, Play Console has a recovery process (request a new upload key). Without Play App
Signing, losing the keystore means you can never publish an update to this app again under the same listing.

## 4. Deploy the family app so `/privacy` is live

Play Console requires a **live URL** for the privacy policy, not a document. `apps/family/src/app/privacy/page.tsx`
is already built and will be live at `https://family-six-theta.vercel.app/privacy` on the next deploy to `main`
(also linked from the in-app Account page, since some reviewers check for an in-app link too).

## 5. Create the Play Console listing

- App name: SabiDrive
- Package name: `com.sabidrive.family`
- Category: likely Education or Maps & Navigation
- Privacy policy URL: `https://family-six-theta.vercel.app/privacy`

## 6. Content rating questionnaire

This is genuinely your call (Play Console asks about your specific content), but for context: no
user-generated public content, no ads, no violence/mature themes — a school-operations tool used by adults
(parents/drivers/admins) even though it's *about* children's whereabouts. Likely lands in "Everyone," but
answer the actual questionnaire yourself rather than trusting this guess.

## 7. Data Safety form

Play Console's Data Safety form asks, per data category: is it collected, is it shared with third parties, is
it required or optional, and why. Mapped from what this app actually does (`CLAUDE.md`'s "Data model & RLS
mental model" section, and the schema in `supabase/migrations/0002_core_schema.sql` onward):

| Category | Collected? | Shared with 3rd party? | Purpose |
|---|---|---|---|
| **Approximate/precise location** | Yes (driver only, only during an active trip) | No — used only within the app, never sold/shared externally | App functionality (live bus tracking) |
| **Name** | Yes (all account holders) | No | Account management, app functionality |
| **Email address** | Yes | No | Account management |
| **Phone number** | Yes, optional (only if the user chooses to verify it) | Sent to Twilio solely to deliver the verification SMS itself | Account management, phone login, SMS notification fallback |
| **In-app messages** | Yes (trip-scoped messages between driver/guardians/school) | No | App functionality |
| **App activity / crash logs** | Only what Vercel/Supabase's own infrastructure logs by default | Standard hosting-provider telemetry, not resold | App functionality, diagnostics |

None of this data is used for advertising, and none is sold. Data is encrypted in transit (HTTPS/TLS
throughout). Users cannot self-delete their account from within the app; deletion is handled by the school
administrator (see CLAUDE.md's "Removing staff and guardians" section) — say so explicitly if the form asks
whether users can request deletion.

## 8. Submit for review

Upload the signed `.aab` from step 2, complete the remaining Play Console prompts (screenshots, feature
graphic, short/full description), and submit. First review typically takes a few days.
