# Adding a Network, Module, or Protocol

This walks through adding each of the three package types this app supports, start to finish — install, configure, rebuild, test. It assumes no prior familiarity with this project. Every example below uses a real package already wired into this app, so you can follow along against working code rather than a hypothetical.

If your goal is specifically "I have my own in-development package and want to test it here," read this once for the mechanics, then see [TESTING_YOUR_PACKAGE.md](./TESTING_YOUR_PACKAGE.md) for what's genuinely provable today per package type and the real bugs this app has already caught.

## The two files every package touches

Every network, module, and protocol needs an entry in exactly two files, always keyed by the same name in both:

- **`wdk.config.js`** (project root) — build-time. Tells the worklet bundler which npm package to compile in.
- **`doctor.runtime.json`** (project root, gitignored — personal to you) — runtime. The actual config values (RPC URLs, credentials) that package needs when the app runs.

Why two files and not one: `wdk.config.js` is checked into git (everyone on the team uses the same set of packages); `doctor.runtime.json` is not (your RPC URLs and API keys shouldn't end up in a shared repo). `doctor.runtime.example.json` is the checked-in template — copy it to `doctor.runtime.json` if you don't already have one (this happens automatically on `npm install` if it's missing).

After changing either file, you need to rebuild the worklet bundle and reload:

```sh
npx wdk-worklet-bundler generate
```

Then reload the app (a full JS reload is enough — you don't need a native rebuild for a config-only change).

---

## Adding a Network

Networks are the most standardized of the three — every network's package implements the same shared account interface, which is exactly why Use Account can show universal cards (`getBalance`, `getAddress`, `sign`, `verify`, etc.) that work the same way regardless of which network is selected.

### Worked example: how `bitcoin` is already wired in

**1. The package is a real npm dependency** (`package.json`):
```json
"@tetherto/wdk-wallet-btc": "^1.0.0-beta.8"
```

**2. `wdk.config.js` declares it:**
```js
networks: {
  bitcoin: {
    package: '@tetherto/wdk-wallet-btc'
  },
  // ...
}
```

**3. `doctor.runtime.json` gives it runtime config, under the same key:**
```json
"networks": {
  "bitcoin": {
    "blockchain": "bitcoin",
    "config": {
      "network": "testnet",
      "client": {
        "type": "blockbook-http",
        "clientConfig": {
          "url": "$EXPO_PUBLIC_BTC_PROVIDER"
        }
      }
    }
  }
}
```

Notice `"$EXPO_PUBLIC_BTC_PROVIDER"` — anything prefixed with `$` gets pulled from your `.env` file at load time (see `.env.example`). This is how secrets stay out of a file that might get shared or committed. If the variable is missing, `doctorRuntime.ts` fails immediately with the exact variable name — it won't let a silent `undefined` reach the worklet.

### Steps to add your own network

1. `npm install <your-network-package>`
2. Add it to `wdk.config.js`'s `networks` section: `yourNetwork: { package: '<your-network-package>' }`
3. Add its runtime config to `doctor.runtime.json`'s `networks` section, under the same key. Check the package's own README for what its config object needs — every network package's shape is different (compare `bitcoin`'s `client.clientConfig.url` above against `ethereum`'s flatter `provider`/`bundlerUrl`/`paymasterUrl` fields in the same file).
4. `npx wdk-worklet-bundler generate`, reload.
5. **Test it**: open Use Account, select your network from the dropdown at the top, try `getBalance` and `getAddress` first — these need no funds and confirm the wire-up works before you try anything that touches real value.

### A real caution worth knowing before you add a network casually

This app's own `spark` network is deliberately on **MAINNET**, not testnet — Spark's testnet auth service was confirmed unreachable during testing, and mainnet was the only thing that worked. That means real funds are genuinely at risk if a Spark wallet in this app gets funded casually. Check whether *your* network has a safe testnet before assuming one exists — don't copy Spark's pattern without meaning to.

---

## Adding a Module

Modules are fundamentally different from networks: **there is no common method set**. Each module package defines its own methods entirely — this is why Use Module doesn't have fixed cards the way Use Account does, just a module picker and a free-form "call any method by name" card.

Two real modules are already wired in, deliberately contrasting in complexity, so you can see both ends of what a module can be.

### Worked example 1: `addressBook` — a real module with real P2P storage

**1. Real npm dependency:**
```json
"@tetherto/wdk-p2p-address-book": "^1.0.0-beta.3"
```

**2. `wdk.config.js`:**
```js
modules: {
  addressBook: {
    package: '@tetherto/wdk-p2p-address-book',
    factory: 'createWorkletModule',
    events: ['update']
  }
}
```

Two things here that aren't obvious from the package name alone, and were only confirmed by reading the package's own source directly:
- **`factory: 'createWorkletModule'`** — this is a *static method name* on the package's default-exported class, not a plain top-level export. The bundler calls it as `<defaultImport>.createWorkletModule(ctx)`. If your module's entry point is structured differently, this field needs to match whatever your package actually exposes — check its source, don't assume a convention.
- **`events: ['update']`** — this list must match every event name the module actually calls `this.emit(...)` with in its own source. Get this wrong (or leave it empty when the module does emit something) and Use Module's Event Log will just silently show nothing, with no error to tell you why.

**3. `doctor.runtime.json`:**
```json
"modules": {
  "addressBook": {
    "storagePath": "./addressbook-storage",
    "namespace": "wdk-doctor-app"
  }
}
```

**A real bug worth knowing about before you hit it yourself:** that `storagePath` value is a placeholder that doesn't actually work — a relative string doesn't resolve inside the Bare worklet's sandbox, and Bare's filesystem won't create missing directories for you. The actual fix (already implemented in `src/providers/DoctorWorkletProvider.tsx`'s `buildRuntimeConfig` function) computes a real, absolute, created-if-missing path at runtime via `expo-file-system`, and substitutes it in before the config is ever sent to the worklet. If your module also needs a storage path, you'll need the same kind of fix — a JSON file genuinely cannot call a native API, so any module needing real device storage can't get a working path from `doctor.runtime.json` alone.

### Worked example 2: `counter` — a trivial synthetic module, on purpose

This one exists purely to prove the *app's own* multi-module handling works, independent of any real package's business logic, storage, or network behavior. If you ever want to test something about this app itself (not a real package) without other variables in the way, this is the pattern to copy.

**1. It's a local package, not a published one** — see `local-modules/wdk-module-counter/`. Wired in via a `file:` dependency:
```json
"wdk-module-counter": "file:./local-modules/wdk-module-counter"
```

**2. Its entire implementation** (`local-modules/wdk-module-counter/index.js`) is about 30 lines: an in-memory counter with `increment`/`getValue`/`reset`, emitting one `update` event. No storage, no networking, no dependencies beyond `bare-events`.

**3. `wdk.config.js` and `doctor.runtime.json` entries** mirror `addressBook`'s shape exactly (same `factory`/`events` pattern), but the runtime config is just `{}` — there's nothing to configure.

### Steps to add your own module

1. If it's a published package: `npm install <your-module-package>`. If it's local/in-development (the common case this app exists for): put it under `local-modules/<your-module-name>/` with its own `package.json`, and add it to the main `package.json` as `"<your-module-name>": "file:./local-modules/<your-module-name>"`, then `npm install`.
2. **Read the module's own source** to find its actual factory function name and every event it emits — don't guess. Look for a static factory method on its default export, and grep for `this.emit(` to find every real event name.
3. Add it to `wdk.config.js`'s `modules` section with the confirmed `factory` and `events`.
4. Add its runtime config to `doctor.runtime.json`'s `modules` section — whatever fields the module's constructor/factory actually expects.
5. `npx wdk-worklet-bundler generate`, reload.
6. **Test it**: open Use Module, your module should appear as a new pill next to `addressBook` and `counter`. Try a read-only method first if one exists (matching `addressBook`'s `getInfo`), watch the Event Log after any write-like call to confirm events are actually being emitted and captured.

---

## Adding a Protocol

Protocols follow the same two-file pattern as networks and modules — but nearly every real protocol package needs one additional fix to actually work, worth understanding before you add your own.

### Worked example: `aave` — confirmed working end to end

**1. Real npm dependency:**
```json
"@tetherto/wdk-protocol-lending-aave-evm": "^1.0.0-beta.7"
```

**2. `wdk.config.js`:**
```js
protocols: {
  aave: {
    package: '@tetherto/wdk-protocol-lending-aave-evm'
  }
}
```
This shape — just a `package` field, keyed by the label you'll use everywhere else — is confirmed correct, verified directly against the bundler's own JSON schema and code generator. It builds a `protocolManagers['aave'] = <the Aave class>` mapping inside the compiled worklet bundle.

**3. `doctor.runtime.json`:**
```json
"protocols": {
  "aave": {
    "protocolName": "aave",
    "blockchain": "ethereum",
    "config": {}
  }
}
```
`protocolName` must match the key used in `wdk.config.js`. `blockchain` must be an already-registered network. Both confirmed directly by reading `@tetherto/pear-wrk-wdk`'s actual `initializeWDK` handler source.

**4. Calling it** needs a specific `options` shape on the `callMethod` request, also confirmed from source (`execution.js`'s `callMethodHandler`):
```json
{ "methodName": "getAccountData", "options": { "protocolType": "lending", "protocolName": "aave" } }
```
`protocolType` is one of a fixed set — `swap`/`bridge`/`lending`/`fiat`/`swidge` — confirmed as the complete set from the handler's own source. The handler swaps the plain account for `account.getLendingProtocol("aave")` (or the equivalent accessor for your protocol's type) before calling your method on it.

### The one thing nearly every protocol package needs beyond this

**Config alone usually isn't enough to get a working call — one dependency fix is needed too.** Every real protocol package checked (Aave, Velora, USDT0 bridge, MoonPay) exact-pins an outdated `@tetherto/wdk-wallet` version in its own `package.json`. This silently breaks protocol registration the moment this app's dependency tree has already converged on a newer shared version — `initializeWDK` succeeds with no error, but the protocol was never actually attached, so calling it later fails with `"No <type> protocol registered for label: <name>"`. This is **not** a config mistake — the config above is genuinely correct and sufficient on its own for a package that doesn't have this dependency issue.

**Full explanation of why this happens, and the confirmed fix (a `package.json` `overrides` entry), is in [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).** Read it before assuming your own protocol's config is wrong.

### A real, instructive failure worth knowing about — and the lesson it taught

An earlier attempt at wiring in a protocol used an incomplete `doctor.runtime.json` entry (just `{package: ...}`-style fields, missing `protocolName`/`blockchain`/`config`). This broke wallet creation and unlock entirely, not just protocol calls, with `WDK_MANAGER_INIT: No protocol manager found for protocol: undefined`. The reason: `initializeWDK` — the call underneath both creating and unlocking any wallet — sends the app's *entire* runtime config, not just the parts relevant to what you're doing. A malformed protocol entry doesn't fail quietly when you go test that protocol specifically; it breaks every wallet operation in the app, immediately, for everyone.

**The lesson that came out of this, and still applies**: test a new protocol entry in genuine isolation before trusting it. Specifically — after adding or changing any protocol config, confirm wallet create/unlock still work *before* testing the protocol itself. This is the single check that would have caught the above immediately instead of after further, more confusing testing.

### Steps to add your own protocol

1. `npm install <your-protocol-package>`
2. Add it to `wdk.config.js`'s `protocols` section: `yourProtocol: { package: '<your-protocol-package>' }`.
3. Add its runtime config to `doctor.runtime.json`'s `protocols` section, with all three fields: `protocolName` (matching the `wdk.config.js` key), `blockchain` (an already-registered network), and `config` (whatever your protocol package's own docs say it needs, or `{}` if nothing).
4. `npx wdk-worklet-bundler generate`, reload.
5. **Before testing the protocol itself, first confirm wallet create/unlock still work.** If they break, a missing `protocolName`/`blockchain` field is the first thing to check.
6. Test the protocol's safest read-only method first, using `options: {protocolType: '<type>', protocolName: '<your key>'}` alongside `methodName`.
7. **If you get `"No <type> protocol registered for label: <name>"` despite correct config**, this is almost certainly the dependency issue described above, not your config — check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) before debugging further.

---

## If something doesn't work

Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) first — two specific, non-obvious failure modes (a silent protocol registration bug, and a wire-format change between `pear-wrk-wdk` versions) are documented there in enough detail to recognize immediately rather than re-debug from scratch. Then check `documentation/TESTING_YOUR_PACKAGE.md`'s "Real bugs this app has already caught" section — several other real, non-obvious bugs (bad storage paths, malformed provider URLs) have already been found and fixed once; there's a good chance a new failure matches one of them rather than being something genuinely new.
