# WDK Doctor App

A debugging and dogfooding console for the **Wallet Development Kit (WDK)**, forked from the WDK React Native Showcase. It keeps the showcase's wallet management functionality, but replaces its fixed, showcase-specific network configuration with a JSON-based system so any WDK package — not just the four the showcase shipped with — can be plugged in and tested without touching a single line of TypeScript.

The project relies on two core components of the WDK ecosystem:
1.  **`@tetherto/wdk-react-native-core`**: The state management and business logic layer.
2.  **`@tetherto/wdk-worklet-bundler`**: A build tool that compiles wallet logic into secure, high-performance worklets.

## 🚀 Overview

Unlike the showcase this was forked from — which demonstrates a fixed set of networks through a polished, production-style UI — this app is built for testing arbitrary WDK packages during development. Which packages get bundled is controlled by `wdk.config.js`; how each one is configured at runtime (RPC URLs, chain IDs, credentials) is controlled by `doctor.runtime.json`, a plain JSON file keyed to match. Adding a new package to test means adding one entry to each file — no code changes, no TypeScript enum to extend.

## ✨ Key Features

### 🔐 Wallet Management
- **Biometric Security**: Create and access wallets secured by device biometrics (FaceID/TouchID).
- **Multi-Wallet Support**: Create, import, and switch between multiple wallet identities (e.g., different users or test accounts).
- **Mnemonic Handling**: Securely import and reveal recovery phrases.
- **Temporary Wallets**: Generate disposable wallets for testing flows without persistence.

### 💰 Asset & Balance Tracking
- **Unified Interface**: Fetch native (ETH, BTC) and token (ERC20, etc.) balances with a single hook.
- **Smart Caching**: Powered by **TanStack Query** for efficient caching, background updates, and offline support.
- **Multi-Chain**: Seamlessly handle assets across Ethereum, Bitcoin, Tron, and Spark.

### 💸 Transactions & Signing
- **Send Funds**: robust transfer logic for native coins and tokens.
- **Message Signing**: Sign standard messages (EIP-191) to prove identity.
- **Typed Data (EIP-712)**: Sign complex structured data for interactions with DAOs and protocols.

### ⚙️ Plug-in Package Configuration
- **`wdk.config.js`**: declares which WDK packages (network, protocol, or module) get bundled into the worklet — accepts npm package names or local filesystem paths for packages under active development.
- **`doctor.runtime.json`**: the runtime counterpart — RPC URLs, chain IDs, and other per-package config, keyed identically to `wdk.config.js`. Gitignored and personal to each contributor; `doctor.runtime.example.json` is the checked-in template, auto-copied into place on `npm install` if you don't have one yet.
- **Fails fast, not silently**: if a config value depends on an `.env` variable that isn't set, the app throws a precise error naming the exact missing variable and where it's referenced, before it ever reaches the worklet.

## 🛠 Project Architecture

The project is built with **Expo** and follows a feature-first directory structure:

```
src/
├── app/
│   └── features/       # Self-contained feature modules
│       └── wallet/     # Wallet logic (Balance, Transfer, Mgmt)
├── components/         # Shared UI (ActionCard, ConsoleOutput)
├── config/             # doctorRuntime.ts (config loader) & Token definitions
└── entities/           # Domain entities (AppAsset)
```

### The Worklet Model
This project utilizes the **WDK Worklet Bundler**. Wallet cryptographic operations (hashing, signing) are compiled into a separate JavaScript bundle that runs on a background thread (Worklet). This ensures:
- **UI Smoothness**: Heavy crypto math never blocks the main thread.
- **Security**: Sensitive key operations are isolated from the main UI context.

## 🏁 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

1.  **Configure environment variables:**
    ```sh
    cp .env.example .env
    ```
    Open `.env` and fill in your provider URLs and any package-specific credentials.
    Refer to the [WDK documentation](https://docs.wdk.tether.io/) for
    instructions on how to obtain each value.

2.  **Declare which packages to bundle:**
    Edit `wdk.config.js` to declare the WDK packages (networks, protocols, or modules) you want compiled into the worklet — an npm package name or a local path both work.

3.  **Install dependencies:**
    ```sh
    npm install
    ```
    This also copies `doctor.runtime.example.json` to `doctor.runtime.json` if you don't have one yet, and generates the worklet bundle from `wdk.config.js`.

4.  **Configure runtime values for your packages:**
    Edit your local `doctor.runtime.json` with RPC URLs, chain IDs, and any other config each package you declared in step 2 needs — keyed by the same names.

### Running the App

```sh
# iOS
npm run ios

# Android
npm run android
```

Changed which packages are bundled (step 2)? Re-run `npx wdk-worklet-bundler generate` and reload. Changed a native addon dependency (`preloadModules` in `wdk.config.js`)? You'll need a full native rebuild (`rm -rf android ios` before the commands above), not just a reload.

## 📦 Core Dependencies

- **`@tetherto/wdk-react-native-core`**: Core hooks and logic.
- **`@tetherto/wdk-worklet-bundler`**: CLI for bundling worklet code.

---

## 📄 License

Apache-2.0