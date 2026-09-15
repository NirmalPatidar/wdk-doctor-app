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
  // Protocols support was attempted here (an `aave` entry pointing at
  // @tetherto/wdk-protocol-lending-aave-evm) but reverted — it broke
  // initializeWDK entirely (WDK_MANAGER_INIT: "No protocol manager found
  // for protocol: undefined"), which meant wallet create/unlock failed too,
  // not just protocol calls, since initializeWDK sends this whole config.
  // The guessed shape (just `package`) was wrong — the bundler needs
  // something more (likely a protocol name/type field, or something that
  // matches wdk-core's registerProtocol(network, protocolName, ...)
  // pattern) that hasn't been confirmed yet. Re-add only after that's
  // actually figured out, ideally verified in isolation before it's wired
  // into the config every wallet operation depends on.
  preloadModules: [
    '@buildonspark/spark-frost-bare-addon'
  ]
}