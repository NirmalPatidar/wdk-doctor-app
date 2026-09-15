// wdk-module-counter — a deliberately trivial synthetic module.
//
// Purpose: validate the Doctor App's multi-module mechanics (the module
// picker switching correctly, per-module event filtering in the event log,
// the stale-result-on-switch fix) using something with zero external
// dependencies and zero real-world stakes — no P2P networking, no storage,
// no funds. If something breaks while testing this, the bug is in the
// Doctor App's own plumbing, not in a third-party package's business logic
// or network conditions. That isolation is the entire point.
//
// Factory shape mirrors @tetherto/wdk-p2p-address-book's confirmed
// createWorkletModule({ seed, config }) signature — this is deliberate,
// so wiring this in exercises the exact same code path a real module would.

const EventEmitter = require('bare-events');

class CounterModule extends EventEmitter {
  constructor(config) {
    super();
    this._value = (config && typeof config.initialValue === 'number') ? config.initialValue : 0;
  }

  // Real modules' factories often do real async setup (opening storage,
  // joining a swarm). This one has nothing to set up, but keeps the same
  // shape (a static factory returning an instance) so the calling
  // convention matches.
  static createWorkletModule({ config } = {}) {
    return new CounterModule(config);
  }

  async getValue() {
    return { value: this._value };
  }

  async increment(amount = 1) {
    this._value += amount;
    this.emit('update', { value: this._value, action: 'increment' });
    return { value: this._value };
  }

  async reset() {
    this._value = 0;
    this.emit('update', { value: this._value, action: 'reset' });
    return { value: this._value };
  }
}

module.exports = CounterModule;
