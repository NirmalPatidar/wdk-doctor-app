# Troubleshooting

Two specific issues cost real debugging time during this app's development — both because the actual cause was several steps removed from the symptom, and the error messages, read literally, pointed somewhere misleading. Documented here in enough detail that recognizing either one takes minutes instead of hours.

---

## "No `<type>` protocol registered for label: `<name>`"

### What it looks like
You've wired up a protocol correctly — `wdk.config.js`'s `protocols` entry, `doctor.runtime.json`'s matching `protocolName`/`blockchain`/`config`, the right `options: {protocolType, protocolName}` on the call. `initializeWDK` succeeds with no error. Then calling the protocol fails:
```
{"code":"UNKNOWN","message":"No lending protocol registered for label: aave.","error":"No lending protocol registered for label: aave."}
```
Every part of the config is genuinely correct. This is not a config problem.

### Why it happens
Every `wdk-protocol-*` package checked (`wdk-protocol-lending-aave-evm`, `wdk-protocol-swap-velora-evm`, `wdk-protocol-bridge-usdt0-evm`, `wdk-protocol-fiat-moonpay`) **exact-pins** an old `@tetherto/wdk-wallet` version in its own `package.json`, instead of a range:

| Package | Pinned `wdk-wallet` version |
|---|---|
| `wdk-protocol-lending-aave-evm` | `1.0.0-beta.13` |
| `wdk-protocol-swap-velora-evm` | `1.0.0-beta.11` |
| `wdk-protocol-bridge-usdt0-evm` | `1.0.0-beta.13` |
| `wdk-protocol-fiat-moonpay` | `1.0.0-beta.14` |

Meanwhile `@tetherto/wdk` itself (and most of the ecosystem) wants a *range* — currently `^1.0.0-beta.15` — which resolves to something newer. npm can't dedupe an exact pin against an already-converged range, so the protocol package gets its own separate, private copy of `wdk-wallet`.

That matters because a protocol class (e.g. `AaveProtocolEvm extends LendingProtocol`) imports `LendingProtocol` from *its own* private `wdk-wallet` copy. `@tetherto/wdk`'s `registerProtocol()` checks `Protocol.prototype instanceof LendingProtocol` against a *different* copy — the shared one. JavaScript's `instanceof` checks module-instance identity, not structural equality: two copies of byte-identical code are never `instanceof` each other. Every branch in `registerProtocol`'s type-check chain fails the same way, for the same reason. There's no final `else` that throws, so the function just returns having registered nothing — and `initializeWDK` reports success, because from its perspective, nothing went wrong.

The error you actually see only appears later, when something tries to look up the protocol that was never really attached — by which point you're several steps removed from the actual cause.

### The confirmed fix
Add an `overrides` entry in the *app's* `package.json` (not the protocol package):
```json
"overrides": {
  "@tetherto/wdk-wallet": "^1.0.0-beta.15"
}
```
**Use the range `@tetherto/wdk` itself declares — not an exact version.** This was tested both ways: an exact pin (matching whatever was hoisted at the time) broke again on the very next `npm install`, when the registry published a newer version and the target moved. A range self-heals through that; a pin needs manual re-syncing forever. Check `npm ls @tetherto/wdk-wallet` in your own tree to confirm the current range `@tetherto/wdk` wants, since this can drift.

After adding the override: `rm -rf node_modules package-lock.json && npm install`, then confirm with `npm ls @tetherto/wdk-wallet` — every entry should show the same version, ideally all `deduped` against each other, with no `invalid` markers anywhere in the tree.

**A global override is confirmed to dedupe more completely than forking just the one protocol package.** A single-package fork can only fix that package's own direct `wdk-wallet` line — nested dependencies-of-dependencies (e.g. Aave's own `wdk-wallet-evm`/`wdk-wallet-evm-erc-4337`, which have their *own* separate pins) stay unfixed. The app-level override reaches the whole tree at once.

### What's still needed
This is a workaround, not a fix. The real fix is upstream — each protocol package's own `package.json` needs its `wdk-wallet` dependency changed from a pin to a range (or, better, moved to `peerDependencies` entirely, which structurally prevents this class of duplication rather than just avoiding it by convention). Reported to the team; not something to keep re-solving locally per project.

### If you hit this with a protocol other than Aave
`use-protocol.tsx`'s `callMethod` helper detects this exact error pattern and appends this same guidance automatically, with the actual protocol name substituted in — check there for the live version of this explanation.

---

## Wallet operations fail with a low-level buffer/TypedArray error, seemingly out of nowhere

### What it looks like
Wallet create or unlock — previously working — starts failing with something like:
```
The sum of the length of the given TypedArray and the offset cannot be greater than the length of this TypedArray
```
or, on create specifically:
```
{"error": "value must be a string"}
```
with **nothing useful in Debug Log** for the second one — the call that actually failed doesn't even show up.

### Why it happens
`@tetherto/pear-wrk-wdk` changed the return shape of `generateEntropyAndEncrypt` and `getSeedAndEntropyFromMnemonic` between beta releases, without a major version bump (this ecosystem treats every beta as potentially breaking):

- **`beta.10` and earlier**: `encryptionKey`, `encryptedSeedBuffer`, `encryptedEntropyBuffer` all returned as base64 **strings** (confirmed directly from that version's own docstring: *"All three returned values are strings"*).
- **`beta.15` and later**: the same three fields are returned as raw **buffers** for HRPC callers specifically (confirmed from that version's own docstring: *"HRPC hands them back live with no interception point in this repo"*).

This app uses HRPC. Over the React Native bridge, a raw buffer arrives as a plain object with numeric string keys (`{"0": 166, "1": 219, ...}`), not an actual `Uint8Array`. Two different consumers need two different shapes:
- **Secure storage's setters require a plain string.**
- **Any RPC call parameter that carries one of these three fields** (`initializeWDK`'s `encryptionKey`/`encryptedSeed`, `getMnemonicFromEntropy`'s `encryptedEntropy`/`encryptionKey`) is encoded on the wire with `compact-encoding`'s `c.buffer` codec — confirmed directly from the generated `messages.js` schema — which requires a **real `Uint8Array`**, not a string. Passing a string there makes the encoder treat character count as byte count, producing exactly the `TypedArray`/`RangeError` above.

The reason `"value must be a string"` never showed up in Debug Log: secure storage calls aren't wrapped by this app's RPC logging (only the `rpc` object is), so a failure there was genuinely invisible to the tool built for exactly this situation.

### The fix already in this app
`DoctorWorkletProvider.tsx` has two small helpers, used consistently everywhere these three fields are touched:
- `toBase64(value)` — normalizes either shape (string or raw-byte-object) into a base64 string, for secure storage.
- `toUint8Array(value)` — normalizes either shape into real bytes, for any RPC call parameter.

Both are defined defensively (handle either wire shape) specifically because which one you get depends on the exact installed `pear-wrk-wdk` version, which this app's history has shown can shift underneath an unrelated `npm install`. Applied in `createWallet`, `importWallet`, `createTemporaryWallet`, `previewMnemonic`, `revealMnemonic`, and `unlockWallet` — the last two matter because they read a string *back* from storage and need to convert it *back* to bytes before the next RPC call, not just on the initial write path.

### The broader lesson
`generateEntropyAndEncrypt`'s result showing as `{"0": 166, "1": 219, ...}` in Debug Log, instead of a quoted base64 string, is the visible symptom of this whole class of bug — if a future `pear-wrk-wdk` update changes this again, that's the first place to look.

---

## General pattern worth internalizing

Both issues above share a shape: a dependency drifted (either the app's own resolved versions, or a completely separate package's return format), the resulting error surfaced several layers away from the actual cause, and the fix required reading real, currently-installed source rather than trusting what any documentation or prior experience said the behavior should be. Before assuming a new error is a new bug:

1. Check whether the exact currently-installed version matches what you last verified against — `npm ls <package>`, and compare `beta.N` numbers, not just "is it installed."
2. If you're touching `package.json` at all, check `git diff package-lock.json --stat` before rebuilding on a device — a big, unexpected diff after a small deliberate change is a real warning sign, not noise.
3. Check Debug Log's full stack trace (not just the message) for exactly which package's code actually threw.
