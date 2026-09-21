# Architecture

This document records the *why* behind decisions that would otherwise look arbitrary reading the code alone — most importantly, why this app doesn't use `@tetherto/wdk-react-native-core`, and how the alternative actually works.

## Why no `@tetherto/wdk-react-native-core`

This is the single most consequential decision in the app, made deliberately, not by omission.

`wdk-react-native-core` wraps the underlying `Worklet` instance and deliberately doesn't expose it. That's a reasonable design choice for a production app, where nothing outside the SDK should be poking at worklet internals. It's the wrong choice for *this* app, whose entire purpose is testing worklet lifecycle behavior directly — suspend/resume timing, linger semantics, raw RPC shapes, what happens when a call is in flight during suspension. None of that is reachable through an API designed to hide it.

The alternative, confirmed working before committing to it: construct one `Worklet` and one `HRPC` client directly, using `react-native-bare-kit` and `@tetherto/pear-wrk-wdk` — the same primitives `wdk-react-native-core` itself is built on, just without the wrapping layer. Every screen in this app talks to that one shared instance through `DoctorWorkletProvider` and its `useDoctorWorklet()` hook.

## `DoctorWorkletProvider` — the one shared instance

Constructed once, at the root of the app (`_layout.tsx`), and never recreated for the app's lifetime. Every screen — wallet management, account/module/protocol testing, the lifecycle controls — reads from and calls into this same provider. This matters for a few things that would break if each screen owned its own worklet:
- Lifecycle state (suspended/active) needs to be one shared truth, not per-screen.
- Debug Log needs to see every RPC call from every screen, which only works if they all go through the same wrapped client.
- The worklet itself is expensive to start; recreating it per screen would make navigation slow and would break in-flight state across screens.

### RPC call logging
The `rpc` object handed to consumers is a `Proxy` wrapping the real `HRPC` client. Every method call is intercepted, logged (call, then result or error), and passed through unchanged. This is how Debug Log captures everything automatically — no individual screen has to remember to log anything, because the logging happens at the one chokepoint every RPC call passes through regardless of which screen initiated it.

Error log entries capture the full stack trace, not just the message — added after a real debugging session where the message alone ("value must be a string") wasn't enough to trace a failure back to its actual cause. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

### Wire format defensiveness
`generateEntropyAndEncrypt` and `getSeedAndEntropyFromMnemonic`'s return shape for `encryptionKey`/`encryptedSeedBuffer`/`encryptedEntropyBuffer` has changed between `@tetherto/pear-wrk-wdk` beta versions (string vs. raw buffer) without a major version bump. `toBase64`/`toUint8Array` in this file normalize either shape defensively, rather than assuming one. Full detail: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## Config system: two files, two different jobs

- **`wdk.config.js`** — build-time. Tells `wdk-worklet-bundler` which packages (networks, modules, protocols) to compile into the worklet bundle, and how (factory function names, event names for modules; just the package name for protocols and networks). Changing this requires `wdk-worklet-bundler generate` to take effect — it's baked into a compiled bundle, not read at runtime.
- **`doctor.runtime.json`** — runtime. The actual connection details (RPC URLs, chain IDs, protocol registration fields) sent to `initializeWDK` every time. Read fresh at runtime via `doctorRuntime.ts`, so changes here just need a reload, not a rebuild.

Both files matter for protocols specifically, and confusing them is a common mistake: `wdk.config.js`'s `protocols` entry is what makes a protocol *exist* in the compiled bundle (`protocolManagers[label] = <the class>`); `doctor.runtime.json`'s matching entry (`protocolName`, `blockchain`, `config`) is what actually *registers* it against a network at `initializeWDK` time. Missing either one produces a different, specific error — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [ADDING_PACKAGES.md](./ADDING_PACKAGES.md).

`doctor.runtime.example.json` is the checked-in template; `doctor.runtime.json` itself is gitignored (it can hold real API keys and provider URLs) and auto-copied from the example by `scripts/ensure-doctor-runtime-config.js` on install if missing.

## Theme system

`ThemeProvider` tracks light/dark, persists the choice via `AsyncStorage`, and exposes `useTheme()` returning `{theme, colors, toggleTheme, setTheme}`. Every screen computes its `StyleSheet` via `useMemo(() => createStyles(colors), [colors])` — a module-scope `StyleSheet.create()` call would freeze colors at import time and never update when the theme toggles, so this pattern is load-bearing, not a style preference.

One untested assumption, flagged directly in `_layout.tsx`: `wdk-uikit-react-native`'s own `ThemeProvider` receives the current theme via a `defaultMode` prop, whose name suggests it may only be read once at mount rather than reactively. Not yet confirmed either way.

## Wallet persistence

`encryptionKey`, `encryptedSeed`, and `encryptedEntropy` are stored via `@tetherto/wdk-react-native-secure-storage`, keyed per-wallet by a user-chosen identifier (not an auto-generated UUID) — matching the pattern used elsewhere in the WDK ecosystem. `AsyncStorage` separately holds a non-sensitive index (`doctor.walletIndex`) of which wallet IDs exist, so the wallet list can render without touching secure storage for anything beyond the active wallet's own credentials.

Every value written to secure storage is a base64 string; every value passed into an RPC call is real bytes (`Uint8Array`) — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for why these need to be different, and why getting this wrong produces confusing, hard-to-trace errors rather than an obvious type mismatch.

## What used to exist here, and why it's gone

An earlier version of this app included a standalone `worklet-poc.tsx` screen — the original proof-of-concept that established the "no rn-core" approach actually works, before `DoctorWorkletProvider` existed. It served its purpose (confirming raw RPC shapes, module calls, and suspend/resume behavior against a real device) and was removed once every real screen exercised the same ground through actual use, making it redundant rather than a unique regression test.
