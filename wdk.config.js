/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */
module.exports = {
  networks: {
    bitcoin: {
      package: '@tetherto/wdk-wallet-btc'
    },
    spark: {
      package: '@tetherto/wdk-wallet-spark'
    },
    ethereum: {
      package: '@tetherto/wdk-wallet-evm-erc-4337'
    },
    tron: {
      package: '@tetherto/wdk-wallet-tron-gasfree'
    }
  },
  modules: {
    // First real test of the "modules" half of the worklet, per the manager's
    // request. Confirmed directly from the package's own source
    // (index.js:284) — the factory is a static method on the default-exported
    // AddressBook class, not a plain top-level export, and the bundler's own
    // code generator (module-modules.ts:59) calls it as
    // `<defaultImport>.${factory}(ctx)` — exactly matching this shape.
    addressBook: {
      package: '@tetherto/wdk-p2p-address-book',
      factory: 'createWorkletModule',
      // Confirmed via `this.emit('update')` at index.js:182 — the only event
      // this module currently emits.
      events: ['update']
    },
    // A deliberately trivial synthetic module (see local-modules/wdk-module-
    // counter) — zero external dependencies, zero real-world stakes. Exists
    // to validate the Doctor App's own multi-module mechanics (the module
    // picker, per-module event filtering) independent of any real package's
    // business logic or network conditions. Mirrors addressBook's exact
    // factory/events shape on purpose, so it exercises the same code path.
    counter: {
      package: 'wdk-module-counter',
      factory: 'createWorkletModule',
      events: ['update']
    }
  },
  // This shape (`package` only, keyed by the name used as the protocol's
  // registration label) is confirmed correct at the wdk.config.js/bundler
  // level — verified against the bundler's own JSON schema
  // (loader-*.js) and its code generator (bundler-*.js's
  // generateProtocolModulesCode), which builds `protocolManagers['aave'] =
  // <the Aave class>` from exactly this. The `aave` key here IS the label
  // that doctor.runtime.json's protocols.aave.protocolName must match
  // (doctor.runtime.json already has this correctly — it was never the
  // problem).
  //
  // KNOWN, SEPARATE, UNRESOLVED ISSUE: even with this correctly added,
  // Aave's actual protocol registration fails *silently* at runtime
  // (initializeWDK succeeds, but a later "No lending protocol registered
  // for label: aave" error occurs when calling it) — traced to
  // @tetherto/wdk-protocol-lending-aave-evm having its own nested,
  // different-version copy of @tetherto/wdk-wallet than the rest of the
  // tree, which breaks an internal instanceof type check with no thrown
  // error. This is a bug in that package's own dependency declaration
  // (it exact-pins an outdated version), not something fixable safely
  // from this app's side — every dependency-override attempt tried has
  // caused a worse regression than the original bug. Report upstream;
  // don't attempt another local fix without a very good reason.
  //
  // This entry (protocols section only, zero dependency changes) is
  // deliberately just the safe half of this work — it fixes wallet
  // create/unlock previously breaking, not Aave's own registration bug.
  protocols: {
    aave: {
      package: '@tetherto/wdk-protocol-lending-aave-evm'
    }
  },
  preloadModules: [
    '@buildonspark/spark-frost-bare-addon'
  ]
}