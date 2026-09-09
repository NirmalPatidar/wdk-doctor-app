# Architecture

This document exists so the reasoning behind this app's structure survives past whoever made each decision — not just what the code does, but why it's built this way instead of the more obvious alternative.

## The core decision: no `@tetherto/wdk-react-native-core`

This app was originally built on `WdkAppProvider`/`wdk-react-native-core`, the same way the showcase app it was forked from is. That changed for one specific reason: **testing worklet lifecycle (suspend/resume) requires reaching the real `Worklet` instance directly, and `rn-core` doesn't expose it** — not as an oversight, but because an earlier, broader version of that access (`useWorklet`) was deliberately removed after causing problems in another product (referred to internally as "the RW problem": an unscoped low-level escape hatch that let application code bypass the SDK's intended boundaries).

Two options were considered:
1. Export a narrow, purpose-built lifecycle hook from `rn-core` (e.g. `useWorkletLifecycle()` returning just `{ suspended, suspend, resume, on }`).
2. Have this app construct and own its worklet entirely independently, using `react-native-bare-kit` and `@tetherto/pear-wrk-wdk`'s `HRPC` client directly — the same pattern `bare-mobile-doctor` (Holepunch's own reference debugging tool) already uses.

**Option 2 was chosen and proven via a standalone POC (`worklet-poc.tsx`) before committing to it.** It requires zero changes to `rn-core`, works identically on every platform (the same pattern applies in Kotlin — confirmed via `wdk-core-kotlin`, which already exposes `suspend()`/`resume()` as public methods, unlike the RN package), and — this is the part that made it the right choice, not just an acceptable one — it means the *same* worklet handles both lifecycle control and every account/module/protocol call. A design that kept `rn-core` for normal operations and bolted on a second, separately-constructed worklet just for lifecycle testing would have meant suspending "a worklet" without it being the one actually running the operations under test. That's not a real test of anything.

The trade-off, accepted deliberately: this app has none of `rn-core`'s convenience layer — no `OperationMutex` dedup protection, no polished wallet state machine, no `clearSensitiveDataOnBackground`. For a production wallet that's a real loss. For a tool whose purpose is poking directly at low-level behavior, it's closer to correct than a liability.

## `DoctorWorkletProvider` — the single shared worklet session

One `Worklet`, one `HRPC` client, constructed once at app launch and held for the app's lifetime. Every screen reads from and calls into the exact same instance via `useDoctorWorklet()`. This is the direct, load-bearing consequence of the decision above — if any screen constructed its own worklet, the "one real worklet" property that makes lifecycle testing meaningful would break immediately.

Two things worth knowing about its internals:

- **`onLog`/`onModuleEvent` are registered before any outgoing call, not after.** This isn't defensive-for-no-reason — during POC testing, the worklet pushed a message before any handler existed for it, and `bare-rpc` crashes with `_handlers[command] is not a function` in that case. A client that can receive server-initiated pushes has to register for them before doing anything else.
- **Every RPC call shape in this file (`workletStart`, `generateEntropyAndEncrypt`, `initializeWDK`, `resetWdkWallets`, `getSeedAndEntropyFromMnemonic`, `getMnemonicFromEntropy`) was confirmed against the actual current wire schema in `@tetherto/pear-wrk-wdk`'s generated `messages.js`** — not inferred from a related SDK's documentation and left at that. Where a cross-referenced source (Kotlin docs) was used as a first pass, it was independently re-verified against the raw schema afterward. This mattered in practice: one such re-check (`resetWdkWallets`) turned up a stale, untraceable "confirmed" comment that needed re-verifying from scratch rather than trusted on faith.

## `callMethod`/`callModule` return JSON-stringified results — screens must unwrap them

`callMethod` is a generic dispatcher — it can call any account method with any return type, so its wire response wraps everything as `{ result: <JSON-stringified value> }`, since the protocol can't know ahead of time whether a given method returns a string, a boolean, or an object. This is a transport necessity, not the real shape of the data.

Any screen calling `rpc.callMethod`/`rpc.callModule` directly is responsible for `JSON.parse`-ing `response.result` before displaying it — `use-account.tsx`'s `callMethod` helper does this centrally, which is why every card on that screen shows clean values (a plain signature string, a plain `true`/`false`) rather than double-encoded JSON. This will need to be replicated in `use-module.tsx`/`use-protocol.tsx` when they're built — it's easy to forget, since the RPC call itself succeeds either way; only the display is wrong if this step is skipped.

## Wallet persistence

Two separate stores, deliberately not one:

- **`@tetherto/wdk-react-native-secure-storage`** — the actual sensitive material (encryption key, encrypted seed, encrypted entropy), keyed per-wallet by its own `identifier` parameter. Real device keychain underneath. No biometric gate — `requireBiometrics` is simply omitted on every call (not set to `false`; the package's own default is already "not required"), per a team decision favoring fast iteration over the production-app security posture.
- **A small `AsyncStorage`-backed index** (`WalletIndexEntry[]`, just `{id, createdAt}`) — exists purely because secure storage has no `listWallets()`, only "does this specific identifier exist." Nothing sensitive lives here.

**Wallet IDs are user-chosen strings** (matching the original showcase's email-style scheme), not internally generated. This means duplicate IDs are a real, live risk — `createWallet`/`importWallet` both check the index and reject a duplicate before writing, since secure storage's setters would otherwise silently overwrite another wallet's credentials with no warning.

**`lockWallet` and `clearTemporaryWallet` both call `resetWdkWallets`**, confirmed real and correctly shaped (see above) — this asks the worklet to actually forget the active wallet's in-memory state, not just clear this app's own UI-level `activeWalletId`. They're kept as separate functions despite sharing an implementation because they mean different things: a temporary wallet was never assigned an `activeWalletId` to begin with (nothing to clear on the UI side), while locking a real wallet clears both.

## Config system: `wdk.config.js` + `doctor.runtime.json`

Two files, two different concerns, deliberately kept separate:

- **`wdk.config.js`** — build-time. Which packages (networks/protocols/modules) get compiled into the worklet bundle. A module needing a factory function (see the `addressBook` entry) points at it by name; the bundler's own code generator calls it as `<defaultImport>.<factory>(ctx)`, confirmed directly from the bundler's source, not assumed from its type definitions alone.
- **`doctor.runtime.json`** — runtime. Per-package config (RPC URLs, chain IDs, credentials), keyed identically to `wdk.config.js`. Gitignored and personal per contributor; `doctor.runtime.example.json` is the checked-in template, auto-copied on `npm install` if missing.

**`doctorRuntime.ts`'s `$VAR` interpolation fails fast, on purpose.** An earlier version let a missing `.env` variable reach the worklet as `undefined`, surfacing later as an opaque `Cannot read properties of undefined (reading 'replace')` with no indication of what was actually wrong. The current loader throws immediately, naming the exact JSON path and exact missing variable.

**A JSON file can't call a native API.** `doctor.runtime.json`'s `modules.addressBook.storagePath` is a static, confirmed-nonfunctional placeholder (`"./addressbook-storage"`) — left that way deliberately rather than silently patched, so nobody reading only that file gets misled into thinking a relative string resolves inside the Bare sandbox. The actual working value is computed at runtime in `worklet-poc.tsx` via `expo-file-system`'s `Paths.document` plus an explicit create-if-missing check, mirroring `bare-mobile-doctor`'s `useBareDirectory` hook — the one confirmed-working precedent for this exact problem.

## Theme system

`ThemeProvider` wraps the app, tracks `light`/`dark`, persists the choice via `AsyncStorage`. The light palette is extracted directly from the WDK RN starter wallet's own prototype CSS variables, not invented — values not present in that source are marked "derived" in `colors.ts`'s comments, so it's clear which are sourced and which are interpolated.

**Button text color follows one explicit rule, centralized as a token, not scattered per-file:** `colors.onPrimary` (white on light theme, black on dark) for text/icons sitting on a `primary`-colored background; `colors.primary` itself for text/icons on any other background. This was formalized after the fact — several early screens had `colors.black` hardcoded before this token existed, matching the dark theme's own convention by coincidence rather than by design, which is exactly what made them break silently once light theme existed.

**Every screen must consume `useTheme()` itself and compute its own styles via `useMemo`.** There's no way to make a module-scope `StyleSheet.create()` reactive to a runtime theme switch — this was a real, mechanical conversion applied file by file (`ActionCard`, `FeatureLayout`, `ConsoleOutput`, `ChainSelector`, `index.tsx`, `manage-account.tsx`, `worklet-poc.tsx`), not a one-time global fix. Any new screen must follow the same pattern from the start, or it will silently render in dark mode regardless of the toggle — this happened at least twice already during this app's development.

## What's confirmed vs. still open

| Claim | Status |
|---|---|
| `rn-core` genuinely fully removed | Confirmed — verified via repo-wide grep, zero remaining imports, removed from `package.json` |
| `workletStart`/`generateEntropyAndEncrypt`/`initializeWDK`/`callMethod` shapes | Confirmed against real device runs in `worklet-poc.tsx` |
| `resetWdkWallets`, `getSeedAndEntropyFromMnemonic`, `getMnemonicFromEntropy` shapes | Confirmed against the raw wire schema directly |
| `sendTransaction`/`transfer` generic shape | Likely correct but may need network-specific extras — confirmed this happens for EVM ERC-4337 |
| `signTransaction` field shape | Not confirmed at all — free-form JSON args, deliberately not named fields |
| Spark testnet vs. mainnet | Testnet confirmed unreachable; mainnet is what's configured, meaning real value is at risk |
| `wdk-uikit-react-native`'s theme mode reactivity | Untested assumption — `defaultMode` prop name suggests it may only read once at mount |
| `use-module.tsx` / `use-protocol.tsx` | Not built — linked from the home screen, currently 404 |

## Appendix: shared component reference

For anyone building a new screen — `use-account.tsx` is the real, working template; this is just the prop reference.

**`FeatureLayout`** (`src/components/FeatureLayout.tsx`) — wraps a screen: safe area insets, back button, scroll container. Props: `title` (string), `description` (string, optional).

**`ActionCard`** (`src/components/ActionCard.tsx`) — one card, one action. Props: `title`, `description` (optional), `fields` (array of `{ id, type: 'text' | 'number' | 'chain' | 'json' | 'select', label?, placeholder?, defaultValue?, options? }`), `action: (values: Record<string, any>) => Promise<any>`, `actionLabel`. Field type `'chain'` renders a `ChainSelector` automatically. One card per distinct operation is the established pattern — not one generic card behind a mode switcher.

**`ConsoleOutput`** (`src/components/ConsoleOutput.tsx`) — displays a result or error inside an `ActionCard`, or standalone. Props: `data` (any — strings show as-is, objects/arrays pretty-print), `error` (boolean, optional, styles red). No `title` prop, despite an earlier version of this repo's docs claiming one.

**`ChainSelector`** (`src/components/ChainSelector.tsx`) — network picker reading live from `doctorRuntime.ts`'s `wdkConfigs.networks`. Props: `selectedChain` (string), `onSelectChain: (chain: string) => void`, `label` (string, optional).

Every new screen must call `useTheme()` and compute its styles via `useMemo(() => createStyles(colors), [colors])` — see "Theme system" above for why a static `colors` import silently breaks in light mode.

