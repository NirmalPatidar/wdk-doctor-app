# Cloud Backup Setup

This guide explains how to configure and use the **Cloud Backup** feature in the WDK React Native Showcase.

Cloud Backup allows users to securely back up encrypted wallet data to a platform-native cloud provider and restore it on another device.

Supported providers:

- **iOS** → Apple CloudKit
- **Android** → Google Drive

---

# Overview

Cloud Backup is designed around three core principles:

- **Platform-native storage**
  - Apple CloudKit on iOS
  - Google Drive AppData on Android

- **End-to-end encryption**
  - Wallet secrets are encrypted before upload.
  - Cloud providers never receive plaintext wallet data.

- **Multi-wallet support**
  - Multiple wallets can be backed up independently using the same cloud account.

---

# Security Model

Cloud Backup never uploads a wallet's entropy and private keys in plaintext.

The backup flow is:

```
Wallet

↓

Generate encrypted wallet payload

↓

AES-256-GCM Encryption

↓

Encrypted JSON

↓

Cloud Provider
```

The cloud only stores encrypted data.

Restoring a wallet requires:

- The encrypted backup
- The Cloud Backup passphrase
- The WDK cryptographic worklets

Without all three, the backup cannot be decrypted.

---

# Backup Flow

```
Wallet

↓

Generate encrypted payload

↓

Serialize JSON

↓

Cloud Backup SDK

↓

Platform Provider

↓

Cloud Storage
```

---

# Restore Flow

```
Cloud Storage

↓

Download encrypted backup

↓

Decrypt payload

↓

Recover wallet

↓

Restore to secure storage
```

---

## Environment Variables

Create a `.env` file and configure the required values.

```bash
# ── Cloud Backup — iOS (CloudKit) ─────────────────────────────────────────────
# Your own CloudKit container + web-services API token (see iOS setup below).
# The iOS backup uses the CloudKit web-services flow, which reads these at
# runtime — you do NOT need to change app.json.
EXPO_PUBLIC_CLOUDKIT_CONTAINER_ID=iCloud.io.tether.wdkshowcase
EXPO_PUBLIC_CLOUDKIT_API_TOKEN=

# ── Cloud Backup — Android (Google Drive) ─────────────────────────────────────
# You can copy the values from .env.example for a published OAuth flow that works out of the box.
# If you want to setup your own google project and OAuth system, tied to your personal account follow steps 1-6 in the Android setup section below
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=

EXPO_PUBLIC_ANDROID_PACKAGE=io.tether.wdkshowcase.<you>

# ── Cloud Backup — Payload encryption ────────────────────────────────────────
# Strong passphrase used to AES-256-GCM encrypt the backup payload before
# uploading to cloud. Must be identical on backup device and restore device.
EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE=
```

---
### Architecture

```
Backup flow:
  wallet mnemonic (WDK secure storage)
    → getSeedAndEntropyFromMnemonic()    WDK encrypts mnemonic → { encryptionKey, encryptedEntropyBuffer }
    → JSON.stringify(...)                combine into single payload string
    → wdkEncrypt(payload, passphrase)    AES-256-GCM + scrypt key derivation
    → JSON.stringify(encryptedPayload)   serialize for cloud storage
    → uploadBackup(payload, walletId)    store under wallet-specific record/file

Restore flow:
  downloadBackup(walletId)              fetch from cloud
    → wdkDecrypt(payload, passphrase)    AES-256-GCM decrypt
    → JSON.parse(...)                    recover { encryptionKey, encryptedEntropyBuffer }
    → getMnemonicFromEntropy(...)        WDK recovers mnemonic
    → restoreWallet(mnemonic, walletId)  recreate wallet in local secure storage
    → wallet appears on Home screen
```

**Per-wallet storage:** Each wallet's backup is stored under a unique, wallet-specific record name derived from the wallet ID:
- iOS CloudKit: `recordName = "wallet_<base64(walletId)>"`
- Android Drive: `fileName = "wallet_<base64(walletId)>.json"`

This means multiple wallets can coexist independently in the same iCloud/Google Drive account.

**Security:** The payload stored in the cloud contains nothing readable without:
1. The app passphrase (`EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE`)
2. The WDK worklet (used in `getMnemonicFromEntropy`)

Neither the raw mnemonic nor the encryption key is ever stored in plaintext in the cloud.

---

## iOS Cloud Backup Setup (Apple CloudKit)

### Step 1 — Apple Developer Portal: Create App ID and iCloud Container

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**
2. Click **Identifiers** → **+**
3. Select **App IDs** → **App** → Continue
4. Description: `WDK Showcase`, Bundle ID: `io.tether.wdkshowcase`
5. Under **Capabilities**, check **iCloud** → Click **Edit**
6. Check **CloudKit**
7. Under **Containers**, click **+** and enter: `iCloud.io.tether.wdkshowcase`
8. Click **Continue** → **Register**

### Step 2 — CloudKit Console: Create the Schema

1. Go to [icloud.developer.apple.com](https://icloud.developer.apple.com)
2. Click **CloudKit Database**
3. Select container `iCloud.io.tether.wdkshowcase` from the top dropdown
4. Left sidebar → **Schema** → **Record Types** → **+**
5. Record Type name: `WalletBackup`
6. Add three fields:

| Field Name | Type |
|---|---|
| `encryptionKey` | String |
| `savedAt` | String |
| `cloudEmail` | String |

7. Click **Save**
8. Left sidebar bottom → **Deploy Schema Changes...** → confirm

> ⚠️ The schema **must be deployed** — saving it is not enough. The Deploy step makes it active in the Development environment.

### Step 3 — CloudKit Console: Generate API Token

1. Still in CloudKit Dashboard, left sidebar → **Settings** → **Tokens & Keys**
2. Click **Generate New Token** (or **+**)
3. Fill in:
   - **Name:** `WDK Showcase`
   - **Sign in Callback:** Select **URL Redirect**
   - **Redirect URL:** `https://wdkshowcase.app/cloudkit-callback`
   - **Allowed Origins:** Any Domain
   - **Discoverability:** Check if you want the user's real name visible (optional)
4. Click **Save**
5. **Copy the token immediately** — it is only shown once on some versions

> ⚠️ **Sign in Callback must be URL Redirect, not Post Message.** Post Message mode is designed for browser popups and does not work with a WebView-based sign-in flow. If you accidentally create a Post Message token, generate a new one.

### Step 4 — Add to `.env`

```bash
EXPO_PUBLIC_CLOUDKIT_CONTAINER_ID=iCloud.io.tether.wdkshowcase
EXPO_PUBLIC_CLOUDKIT_API_TOKEN=your_token_here
```

### Step 5 — Rebuild

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

---

## Android Cloud Backup Setup (Google Drive)

### Step 0 — Quick start: use the published demo client (skip Steps 1–6)

If you're just trying the feature for a demo or to learn, you don't need your own
Google project. Copy the default `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and
`EXPO_PUBLIC_ANDROID_PACKAGE` from `.env.example` into your `.env` as-is — Google
Drive backup works out of the box, because that web client is **published** and the
default package pairs with it.

> Demo only — don't ship this client in production. For your own app, follow
> Steps 1–6 below (and set your own unique `EXPO_PUBLIC_ANDROID_PACKAGE`).

### Step 1 — Get your debug SHA-1 fingerprint

Run this after your first `expo prebuild`:

```bash
cd android && ./gradlew signingReport
```

Look for `Variant: debug` and copy the `SHA1` line. It looks like:
```
SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
```

### Step 2 — Google Cloud Console: Create OAuth Credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project** → name it `WDK Showcase` → Create

2. **Create an Android OAuth Client ID** (required even though you won't use it in code — it registers your package + SHA-1 with Google):
   - Left sidebar → **APIs & Services → Credentials → + Create Credentials → OAuth Client ID**
   - Application type: **Android**
   - Package name: **your own** — the value you'll set as `EXPO_PUBLIC_ANDROID_PACKAGE` below (e.g. `io.tether.wdkshowcase.<you>`). **Do not reuse `io.tether.wdkshowcase`** — the `(package + SHA-1)` pair is globally unique across Google, and that one is already registered. Pick a suffix unique to you.
   - SHA-1: paste from Step 1
   - Click **Create**

3. **Create a Web Application OAuth Client ID** (this is the one you put in `.env`):
   - **+ Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Name: `WDK Showcase Web Client`
   - Click **Create**
   - Copy the **Client ID** — looks like `123456789-abc.apps.googleusercontent.com`

### Step 3 — Enable Google Drive API

1. Left sidebar → **APIs & Services → Library**
2. Search: `Google Drive API` → Click it → **Enable**

### Step 4 — Configure OAuth Consent Screen

1. Left sidebar → **APIs & Services → OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in App name: `WDK Showcase`, support email
4. Click **Save and Continue**
5. On **Scopes** → **Add or Remove Scopes**
6. Search `drive.appdata`, check it → **Update → Save and Continue**
7. On **Test users** → **+ Add Users** → add the Gmail address you'll test with
8. Click **Save and Continue**

> ⚠️ The `drive.appdata` scope **must be added to the consent screen** before sign-in. Without it, Google silently returns an access token that lacks Drive permission, and every backup attempt will fail with a 401.

### Step 5 — Add to `.env`

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123456789-abc.apps.googleusercontent.com
# Same value you used for the Android OAuth client's package name above:
EXPO_PUBLIC_ANDROID_PACKAGE=io.tether.wdkshowcase.<you>
```

> Only the **web** client ID goes in code. The Android client ID is never
> referenced — it just needs to exist so Google can match your `(package + SHA-1)`
> to your project. The package you set here is applied at build time via
> `app.config.js`.

### Step 6 — Rebuild

```bash
npx expo prebuild --clean
npx expo run:android
```

### Android Runtime Notes

- **DEVELOPER_ERROR (10):** Almost always means the SHA-1 fingerprint for your debug build is not registered under the Android OAuth Client ID in Google Cloud Console. Re-run `./gradlew signingReport` and compare the SHA-1 to what's registered.
- **Package name mismatch:** The Android Client ID package name must exactly match `applicationId` in `android/app/build.gradle`, including any build-variant suffixes (e.g. `.debug`).
- **Drive scope prompt:** On first sign-in, Google shows a permission dialog asking the user to grant Drive appdata access. The user must tap Allow. If they deny, subsequent backup attempts fail until they re-authenticate.

---

## Cloud Backup Passphrase

Set a strong passphrase in `.env`:

```bash
EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE=your-strong-passphrase-here
```

This passphrase is used to AES-256-GCM encrypt the backup payload (via `@tetherto/wdk-utils`) before anything is uploaded to CloudKit or Google Drive. The encryption uses scrypt key derivation, so even a moderate passphrase produces a cryptographically strong key.

**Important:** The same passphrase must be present on every device that needs to restore from backup. If you change the passphrase, existing backups cannot be decrypted — you must re-backup all wallets with the new passphrase.

---

## Troubleshooting

### iOS

| Error | Cause | Fix |
|---|---|---|
| `Native module not found` | App built with Expo Go instead of `expo run:ios` | Run `npx expo run:ios --device` |
| `ACCESS_DENIED: private db access disabled` | Using `CKFetchWebAuthTokenOperation` token | Already fixed — app uses CloudKit JS WebView |
| `missing required field 'recordChangeTag'` | SDK bug in `deleteBackup()` | Already fixed — app uses `forceDelete` directly |
| Token not received after Apple ID sign-in | API token has Post Message callback instead of URL Redirect | Regenerate token with URL Redirect → `https://wdkshowcase.app/cloudkit-callback` |
| Schema errors on upload | `WalletBackup` schema not deployed | CloudKit Console → Deploy Schema Changes |

### Android

| Error | Cause | Fix |
|---|---|---|
| **403 / "access blocked" / "hasn't completed verification"** | The OAuth consent app you're signing into is in **Testing** mode and your Google account isn't on its tester list (or the app isn't published). Your app authenticates against whichever project owns your `(package + SHA-1)` — so if you reused `io.tether.wdkshowcase`, that's Tether's project, and only its testers can sign in | Use the published demo client (Step 0), **or** get added as a tester on that project, **or** switch to your OWN unique package + your own client with your account as a tester (or the app published) |
| `Requested entity already exists` when creating an Android OAuth client | The `(package + SHA-1)` pair is globally unique across Google and is already registered in another project (e.g. `io.tether.wdkshowcase` + the Expo default debug SHA is registered in Tether's project) | Use a UNIQUE package (e.g. `io.tether.wdkshowcase.<you>`) and register the Android client for that instead |
| `DEVELOPER_ERROR (10)` | SHA-1 fingerprint not registered, or package name mismatch | Register your debug SHA-1 (see note below) under the Android OAuth Client ID |
| `authentication failed — Failed to write backup` | `drive.appdata` scope missing from access token | Add scope in OAuth consent screen; re-sign-in after adding |
| `Google Sign-In cancelled` | User dismissed the sign-in prompt | Normal — user can retry |
| `Play Services not available` | Device has no Google Play Services | Not supported on this device |

> **Debug SHA-1 note:** the debug build is signed with `android/app/debug.keystore` (Expo's default keystore), **not** `~/.android/debug.keystore`. Its SHA-1 is the same on every machine/Expo project (`5E:8F:16:…`), so register *that* one. Fastest way to read it: `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1`

---

## Building for Production

```bash
# iOS release build
npx expo prebuild --clean
npx expo run:ios --configuration Release --device

# Android release build
npx expo prebuild --clean
npx expo run:android --variant release
```

For App Store / Play Store submission, use EAS Build:

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

---

## License

Apache-2.0 — see [LICENSE](./LICENSE)
