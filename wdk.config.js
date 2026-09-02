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
    }
  },
  preloadModules: [
    '@buildonspark/spark-frost-bare-addon'
  ]
}