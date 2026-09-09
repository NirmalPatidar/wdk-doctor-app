# Testing Your Package with the Doctor App

This is the guide the whole app exists for. If you're building a WDK network, protocol, or module and want to catch integration issues before it goes further, this walks through plugging your package in and actually exercising it.

## The two-file config, in practice

Every package needs an entry in two files, keyed by the same name.

**`wdk.config.js`** — declares your package for the worklet bundle:
```js
networks: {
  yourNetwork: {
    package: '@your-org/wdk-wallet-yourchain'
  }
}
```
For a module needing a factory function (not every module does), check the package's own source for how its worklet-side entry point is actually structured — don't assume a convention. The `addressBook` entry in this repo's `wdk.config.js` is worked through as a real example: its factory turned out to be a static method on the default-exported class (`AddressBook.createWorkletModule`), not a plain top-level export, confirmed by reading both the package's source and the bundler's own code generator, not assumed from either alone.

**`doctor.runtime.json`** — your package's runtime config, same key:
```json
"networks": {
  "yourNetwork": {
    "blockchain": "yourNetwork",
    "config": { "provider": "$YOUR_PROVIDER_URL" }
  }
}
```
Use `$VAR_NAME` for anything secret — it's pulled from `.env` and fails fast with a precise error naming the exact missing variable if it isn't set, rather than letting `undefined` reach the worklet silently.

Then: `npx wdk-worklet-bundler generate`, reload the app.

## Actually exercising it — what's real right now, and what isn't

**Networks: fully supported.** Use Account gives you one dedicated card per common method (`getBalance`, `getAddress`, `sign`, `verify`, `sendTransaction`, `transfer`, and quote variants), plus a Custom Method card for anything specific to your package. Pick your network from the dropdown, everything below targets it.

**Modules: provable, but no dedicated screen yet.** `addressBook` is the one real, end-to-end proof this works — but that proof happened in `worklet-poc.tsx`, not through any polished UI, because Use Module hasn't been built yet. Until it exists, testing a module means either extending `worklet-poc.tsx` with your own `rpc.callModule(...)` calls following its existing pattern, or building a minimal one-off screen modeled directly on `use-account.tsx`.

**Protocols: config-only, never actually tested.** `doctor.runtime.json`'s `protocols` section is empty. Nothing about the protocol path — config shape, `rpc.registerProtocol`/`callMethod` with a protocol type, anything — has been exercised against a real protocol package. If you're testing a protocol, you are the first, and the value curatorially and mechanically may need to be worked out as you go rather than followed from a proven path.

## What this has already caught — real bugs, not hypotheticals

Worth reading before you start, since these are exactly the kind of thing a package author testing here should expect to hit:

- **A relative `storagePath` doesn't resolve inside the Bare sandbox, and Bare's filesystem won't create missing directories for you.** If your package needs storage, it needs a real, absolute, created-if-missing path — computed at runtime via `expo-file-system`'s `Paths.document`, not a static string in `doctor.runtime.json` (a JSON file can't call a native API). See `worklet-poc.tsx`'s `buildConfigWithRealStoragePath` for the working pattern.
- **A fresh multi-writer store (autobase-backed, etc.) may need an explicit enrollment step before any write succeeds.** `addressBook`'s `addContact` doesn't check or wait for writability itself — a separate `create()` call does that, and skipping it produces a "Not writable" error that has nothing to do with permissions.
- **A malformed provider URL (missing `https://`, wrong host) surfaces as a generic, unhelpful error deep in the worklet** (`Cannot read properties of undefined (reading 'replace')`, or `INVALID_URL: Invalid URL`) — not a clear "your config is wrong" message. If you hit either, check your `.env` values character by character before assuming the package itself is broken.
- **`callMethod`/`callModule` results are JSON-stringified regardless of the real return type.** If your test output looks double-encoded (a quoted string inside a `{result: ...}` wrapper), that's expected wire behavior, not your package doing something wrong — `JSON.parse` it before judging the actual value.
- **Worklet suspend/resume behaves differently than the native default suggests.** `linger` is a grace period *before* suspension takes effect, not a duration *of* suspension — a new operation started during the linger window still completes. If your package holds open connections (network sockets, P2P swarms), test what actually happens to them across a real suspend/resume cycle, not just whether the call succeeds while active.

## If something doesn't work

Rule out the categories above first — most failures so far have been config/environment issues (bad URL, wrong storage path, missing enrollment step), not the doctor app itself or the package's actual logic. If you've ruled those out and it's still failing, that's a genuine finding worth reporting back — which is exactly the point of testing here before wider integration.
