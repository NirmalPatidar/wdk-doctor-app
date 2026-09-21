# Testing Your Package

This is the primary reason this app exists: a place to plug in a WDK package you're developing and test it end to end — real wallet, real calls, real worklet lifecycle — before it lands in a production app.

## The two-file workflow

Every package type follows the same two-file pattern:

1. **`wdk.config.js`** — build-time. Declares the package so the bundler compiles it in. Requires `npx wdk-worklet-bundler generate` (or a fresh `npm install`, which runs it automatically) to take effect.
2. **`doctor.runtime.json`** — runtime. The actual connection details. Just needs a reload to take effect.

The exact shape of each entry differs by package type — see [ADDING_PACKAGES.md](./ADDING_PACKAGES.md) for worked examples of all three.

## What's actually provable today, by package type

### Networks — fully supported, well-proven
Four real networks are wired in and confirmed working: Bitcoin, Spark, Ethereum (via ERC-4337), Tron. Adding a new network follows the exact same pattern — no known gaps.

### Modules — fully supported, two real confirmed examples
`@tetherto/wdk-p2p-address-book` (real P2P storage) and `wdk-module-counter` (a deliberately trivial synthetic module, dependency-free, used to validate the app's own multi-module mechanics independent of any real package's behavior). Adding a new module follows the same pattern as both.

### Protocols — confirmed working, with one dependency caveat that applies to nearly everything in this category
`@tetherto/wdk-protocol-lending-aave-evm` is wired in and confirmed working end to end — real data back from Aave's contract on Sepolia.

**Before testing any protocol, read this:** every real `wdk-protocol-*` package checked (Aave, Velora, USDT0 bridge, MoonPay) exact-pins an outdated `@tetherto/wdk-wallet` dependency, which silently breaks protocol registration the moment this app's dependency tree has already converged on a newer shared version — no error at registration time, just a confusing failure later when you actually try to call it. This is **not** something wrong with your package's own config; it's a known, confirmed, upstream dependency issue. Full detail and the exact fix (a `package.json` `overrides` entry): **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**.

Practically: if you wire up a new protocol correctly and it fails with `"No <type> protocol registered for label: <name>"`, don't assume your config is wrong — check TROUBLESHOOTING.md first. The app's own error handling for this (in `use-protocol.tsx`) will point you there directly when it happens.

## Real bugs this app has already caught

Documenting these because they're the actual value of an app like this — problems that would otherwise only surface once a package was already in a production app:

- **A relative `storagePath` string doesn't resolve inside the Bare sandbox** (`@tetherto/wdk-p2p-address-book`'s config) — needed an absolute, runtime-computed path instead. See `doctor.runtime.json`'s own `_readme` field for the full account.
- **`initializeWDK` sends the app's entire runtime config, not just the relevant part** — meaning a malformed *protocol* entry can break *wallet create/unlock*, not just protocol calls. Discovered when an early, incomplete protocol config entry broke every wallet operation in the app. Always re-test basic wallet create/unlock immediately after any config change, before testing the thing you actually meant to test.
- **The wire format for `generateEntropyAndEncrypt`'s return values changed between `@tetherto/pear-wrk-wdk` beta versions**, without a major version bump — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md). Worth knowing this ecosystem's betas can carry real breaking changes silently.
- **The protocol registration dependency issue described above** — found, understood, and worked around, with a template fix ready to propose upstream.

## Before you start

1. Confirm the *existing* wallet/account/module screens still work (see [HOW_TO_USE.md](./HOW_TO_USE.md)) — a clean baseline makes it obvious whether something you add breaks anything, rather than wondering if it was already broken.
2. If your package touches dependencies at all, read the dependency-change checklist in the main [README](../README.md) before running `npm install` — this app's history has more than one example of a small, deliberate dependency change causing an unrelated, larger break that only showed up once actually tested on a device.
