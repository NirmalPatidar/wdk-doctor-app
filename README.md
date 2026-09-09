# WDK Doctor App

A debugging and dogfooding console for the Wallet Development Kit (WDK). It lets a developer plug in a new WDK package — a network, a protocol, or a module — and test it end to end (create a wallet, call its methods, suspend and resume the underlying worklet) without waiting for it to land in a production app first.

**If you're here to test your own package, start with [TESTING_YOUR_PACKAGE.md](./TESTING_YOUR_PACKAGE.md)** — that's the primary reason this app exists. The rest of this README is setup and a tour of the app itself.

**This app does not use `@tetherto/wdk-react-native-core`.** That's a deliberate, load-bearing decision, not an oversight — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full reasoning. Every screen talks to the worklet directly via `react-native-bare-kit` and `@tetherto/pear-wrk-wdk`'s `HRPC` client, through one shared provider (`DoctorWorkletProvider`).

## Prerequisites

- Node.js (v18+)
- npm
- A configured Android/iOS native toolchain (this app builds native code — Expo's managed-workflow-only tooling isn't sufficient)

## Setup

1. **Create your local config files:**
   ```sh
   cp doctor.runtime.example.json doctor.runtime.json   # if not already present
   ```
   Also create a `.env` file — as of this writing, no `.env.example` exists in the repo despite being referenced by the setup script and error messages below. Required variables (confirmed from `doctorRuntime.ts`'s fail-fast validation and `doctor.runtime.example.json`'s `$VAR` references):
   ```
   EXPO_PUBLIC_BTC_PROVIDER=https://tbtc1.trezor.io/api
   EXPO_PUBLIC_EVM_PROVIDER=<your Sepolia RPC URL>
   EXPO_PUBLIC_EVM_BUNDLER_URL=<your Candide/ERC-4337 bundler URL>
   EXPO_PUBLIC_EVM_PAYMASTER_URL=<same as bundler URL, typically>
   EXPO_PUBLIC_TRON_PROVIDER=https://nile.trongrid.io/
   EXPO_PUBLIC_TRON_GASFREE_PROVIDER=https://open-test.gasfree.io/nile
   EXPO_PUBLIC_TRON_GASFREE_API_KEY=<from gasfree.io dev portal>
   EXPO_PUBLIC_TRON_GASFREE_API_SECRET=<from gasfree.io dev portal>
   ```
   **Note: Spark has no corresponding variable.** It's configured directly in `doctor.runtime.json` as `"network": "MAINNET"` — not a placeholder, not testnet. See the "Spark is on Mainnet" section below before touching it.

2. **Install:**
   ```sh
   npm install
   ```
   This runs `scripts/ensure-doctor-runtime-config.js` (copies `doctor.runtime.example.json` → `doctor.runtime.json` if missing) and `wdk-worklet-bundler generate` (builds the worklet bundle from `wdk.config.js`).

3. **Run:**
   ```sh
   npm run android   # or npm run ios
   ```

### When you need to rebuild vs. just reload

| You changed... | What you need |
|---|---|
| A `doctor.runtime.json` value (RPC URL, chain ID) | Just reload — `doctorRuntime.ts` re-reads this at bundle time |
| Which packages are declared in `wdk.config.js` | `npx wdk-worklet-bundler generate`, then reload |
| `preloadModules` in `wdk.config.js` (native addons) | Full native rebuild: `rm -rf android ios`, then `npm run android`/`ios` |
| Any JS/TS in `src/` | Just reload |
| A new native JS dependency (e.g. `async-storage`) was added but never natively rebuilt since | Full native rebuild — a JS-only reload will *not* pick up new native modules, and will fail with errors like "Native module is null" |

## Tour of the app

### Home screen (`src/app/index.tsx`)
Three things at a glance:
- **Worklet Ready** / **Wallet Ready** / **Active-or-Suspended** status badges. These are three genuinely separate things — "Worklet Ready" only means the worklet process started; it says nothing about whether a wallet has been initialized inside it. If you call a method and get `WDK_MANAGER_INIT: WDK not initialized`, this is almost always why — check "Wallet Ready" specifically.
- **Manage Worklet Lifecycle** — a linger (ms) field plus Suspend/Resume buttons, operating on the one real worklet the whole app shares. Linger is a grace period *before* suspension takes effect, not a duration *of* suspension — once truly suspended, only Resume brings it back; it never resumes on its own. A theme toggle (light/dark) sits in the header.
- **Wallets** — every wallet you've created or imported, with inline Unlock/Lock. A "Manage" link goes to the full Wallet Management screen for create/import/delete/reveal.

### Wallet Management (`src/app/features/wallet/manage-account.tsx`)
Every wallet action, each as its own dedicated card (not a generic form): Create, Import from Mnemonic, Generate Mnemonic (preview only, nothing persisted), Create/Clear Temporary Wallet, Lock, Delete (both a manual-ID card and a per-wallet button in the list), and Reveal Mnemonic (both for whichever wallet is currently active, and per-wallet in the list). No biometric gate — a deliberate team decision for faster iteration, not a gap.

### Use Account (`src/app/features/doctor/use-account.tsx`)
Pick a network and account index once at the top; every method below shares them. One dedicated card per method — universal methods (`getBalance`, `getAddress`, `sign`, `verify`, `sendTransaction`, `transfer`, and their quote variants, `signTransaction`) always show, confirmed directly against `wdk-wallet`'s shared base account class. Network-specific methods only appear where they actually apply — `getStaticDepositAddress` shows only when Spark is selected, since it's confirmed absent from every other network's account class entirely, not just untested. A Custom Method card covers anything not listed. A warning banner appears if no wallet is active, since every method here needs one.

**Confidence levels differ by method, and each card's description says so.** `getBalance`/`getAddress`/`getTokenBalance`/`sign`/`verify` are solid — traced directly to the base class. `sendTransaction`/`transfer` use a generic shape that may need network-specific extras (confirmed this happens for EVM's ERC-4337 paymaster options). `signTransaction` has no confirmed field shape at all, so it takes raw JSON instead of named fields.

### Use Module, Use Protocol
**Linked from the home screen but not yet built.** Tapping either currently 404s. This is genuine, tracked scope — not a bug to report, a feature to build. They should follow `use-account.tsx`'s exact pattern once built: one card per confirmed operation, `rpc.callModule`/whatever the protocol equivalent is, network/context picked once at the top.

### Worklet POC (`src/app/features/doctor/worklet-poc.tsx`)
The original proof-of-concept that established the whole "no rn-core" approach works — manual RPC calls, module calls against the real `@tetherto/wdk-p2p-address-book` package, and deliberate suspend/resume tests. Left in the app intentionally, not just as scaffolding history — it's a genuine regression test. If this stops working after a change, something fundamental broke.

## Adding a new package to test

See **[TESTING_YOUR_PACKAGE.md](./TESTING_YOUR_PACKAGE.md)** — the primary guide this app exists for: the two-file config workflow, what's actually provable today for each package type (networks fully supported, modules provable but without a dedicated screen yet, protocols genuinely untested), and the real bugs already caught this way.

## Known, tracked gaps — not silently unhandled

- **Spark is on Mainnet, not testnet.** Spark's testnet auth service was confirmed unreachable during testing (`UNAVAILABLE: connection refused`), independently reproduced, ruled out as a local config/device issue. Real value is at risk if this wallet is funded casually. See `doctor.runtime.example.json`'s `_readme` field for the full writeup and the open question (testnet outage vs. Spark's own docs suggesting `REGTEST` is the actually-intended path).
- **`.env.example` doesn't exist.** Referenced by the setup script and error messages; needs creating from the variable list above before this is committed, or the next person hits exactly the confusing "why does this error mention a file I don't have" experience this app is otherwise careful to avoid.
- **`lockWallet`/`clearTemporaryWallet` call `resetWdkWallets`**, confirmed against the real current wire schema — but "confirmed" here means the request/response shape matches, not that every downstream effect has been exhaustively tested.
- **`wdk-uikit-react-native`'s `ThemeProvider`** is passed the current theme via its `defaultMode` prop. The name suggests it may only be read once at mount, not reactively — untested assumption, flagged directly in `_layout.tsx`'s code comments.

## Core dependencies

- **`react-native-bare-kit`** — constructs and controls the Bare worklet directly (start, suspend, resume, IPC).
- **`@tetherto/pear-wrk-wdk`** — the `HRPC` client bound to the worklet's IPC stream; every RPC call in this app goes through it.
- **`@tetherto/wdk-worklet-bundler`** — CLI that compiles `wdk.config.js`'s declared packages into the worklet bundle.
- **`@tetherto/wdk-react-native-secure-storage`** — device keychain-backed storage for each wallet's encryption key and encrypted seed, keyed by wallet ID.
- **`@tetherto/wdk-uikit-react-native`** — shared UI theming primitives (separate from, and unrelated to, `wdk-react-native-core` — this one was never part of the removal).

## License

Apache-2.0
