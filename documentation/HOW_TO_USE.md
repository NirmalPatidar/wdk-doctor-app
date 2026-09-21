# How to Use the WDK Doctor App

A hands-on walkthrough for running the app for the first time and exercising every screen. If you're here to test your *own* package rather than explore the existing one, see [TESTING_YOUR_PACKAGE.md](./TESTING_YOUR_PACKAGE.md) instead — this doc assumes you just want to see the app work.

## 1. First launch

After setup (see the main [README](../README.md)) and `npm run android`/`ios`, you'll land on the **Home screen**. Check the three status badges at the top:
- **Worklet Ready** should already be checked — the worklet starts automatically on app launch.
- **Wallet Ready** will be unchecked — no wallet exists yet.
- **Active** will be unchecked, for the same reason.

If **Worklet Ready** never checks, something's wrong before you even get to wallet testing — check Debug Log for a `workletStart` error before proceeding.

## 2. Create a wallet

Tap **Manage** next to "Wallets" (or scroll to Wallet Management from the tools list). In the **Create New Wallet** card:
1. Enter a wallet ID — any string, email-style is the convention used elsewhere (`test@example.com`), but it's just an identifier.
2. Tap **Create Wallet**.

This generates a real seed phrase, persists it to secure storage, and activates it — the Home screen's **Wallet Ready** and **Active** badges should both check immediately after. No biometric confirmation is required (a deliberate choice for faster iteration).

**If this fails**, check the exact error against [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — a couple of specific, previously-seen failure modes are documented there in detail, particularly ones involving raw byte arrays or `TypedArray` errors, which look alarming but have a known, understood cause.

## 3. Try account operations

Go to **Use Account**. Pick a network (Bitcoin, Spark, Ethereum, or Tron) and leave account index at `0`. Try:
- **Get Address** — should return immediately, no network call needed for most chains.
- **Get Balance** — makes a real network call to that chain's configured RPC provider; expect `0` for a fresh wallet.

Switch networks and notice the available cards change — `Get Static Deposit Address` only appears for Spark, since it's confirmed not to exist on any other network's account class.

## 4. Try a module

Go to **Use Module**. Pick **counter** from the module dropdown first — it's a trivial, dependency-free module, good for confirming the mechanics work before trying something real:
1. Tap **Get Value** — should return `{value: 0}`.
2. Tap **Increment** — should return an incremented value.
3. Tap **Reset** — should return to `{value: 0}` and fire an `update` event, visible in the event log below.

Then switch to **addressBook** for a real package: **Create**, then **Add Contact** with something like `[{"name": "Test"}]`, then **List Contacts** to see it stored.

## 5. Try a protocol

Go to **Use Protocol**. Select **Ethereum** as the network (Aave is only registered there), then tap **Get Account Data (Aave)** — no fields to fill in. This makes a real read against Aave's contract on Sepolia via your configured `EXPO_PUBLIC_EVM_PROVIDER`. Expect all zeros for collateral/debt (a fresh wallet, never touched Aave) and a very large number for `healthFactor` — that's `2^256 - 1`, Aave's standard representation of "infinite" health factor when there's no debt to divide by, not an error.

**If your RPC provider is the shared Alchemy demo endpoint**, you may hit a `429 Too Many Requests` — that's the provider's rate limit, not a bug in this app. Get your own free Alchemy key (see the main README's setup section).

## 6. Try the lifecycle controls

Back on Home, under **Manage Worklet Lifecycle**:
1. Enter a linger value, e.g. `5000`.
2. Tap **Suspend**.
3. Immediately go to **Use Account** and tap a method that's already in flight from *before* you tapped Suspend, or — more simply — just observe that a *new* call started right after tapping Suspend still gets blocked, since linger protects work already running, not new requests.
4. Tap **Resume** — the worklet returns to Active; it never resumes on its own.

## 7. Check Debug Log

Every action above generated entries here. Open **Debug Log** and filter by category — `RPC Call`/`RPC Result`/`RPC Error` cover everything you just did. This is the first place to look if anything above didn't behave as described, and the place to export from (via the **Export** button, which opens the native share sheet) if you need to attach evidence to a bug report.

## Next steps

- Want to add a new network, module, or protocol? See [ADDING_PACKAGES.md](./ADDING_PACKAGES.md).
- Testing your own in-progress package? See [TESTING_YOUR_PACKAGE.md](./TESTING_YOUR_PACKAGE.md).
- Something behaving unexpectedly? Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) before assuming it's new — several non-obvious failure modes are already documented there.
