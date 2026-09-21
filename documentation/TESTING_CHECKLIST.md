# End-to-End Testing Checklist

A full pass through this is what "this is complete and working" should mean for this app. Organized roughly in dependency order — earlier sections unblock later ones (you need a wallet before Use Account means anything, for instance).

Where a check has a known risk or a specific expected value, it's noted — don't just confirm "it didn't crash," confirm the actual result matches what's expected.

## 0. Build and launch

- [ ] `npm install` completes without errors
- [ ] `npx wdk-worklet-bundler generate` completes without errors (runs automatically via `postinstall`, but worth running manually once to see its own output)
- [ ] `npm run android` / `npm run ios` builds and installs
- [ ] App launches: splash screen shows briefly, then hides (no indefinite hang)
- [ ] No red-screen error on launch

## 1. Home screen — status and lifecycle

- [ ] **Worklet Ready** badge is checked shortly after launch
- [ ] **Wallet Ready** badge is *unchecked* before any wallet exists (this is correct, not a bug)
- [ ] Third badge shows **Active** (not Suspended) on launch
- [ ] Tap the theme toggle (sun/moon icon, top right) — the whole screen switches between light and dark immediately
- [ ] Restart the app after toggling — the theme choice persisted
- [ ] In **Manage Worklet Lifecycle**: leave the linger field blank, tap **Suspend** — status flips to Suspended
- [ ] Tap **Resume** — status flips back to Active
- [ ] **In-flight calls survive linger; new calls during linger don't.** On Use Account, tap **Get Balance**, and *before it resolves* switch to Home and tap **Suspend** with a linger value (e.g. `5000`) already entered — the in-flight call should still complete successfully. Then, still within the linger window, go back to Use Account and tap **Get Balance** again — this new call should time out/fail, the same as if fully suspended. Linger only protects existing work; it doesn't hold the door open for new requests.
- [ ] After linger elapses without tapping Resume, status should show Suspended and stay that way — it does *not* automatically flip back to Active on its own

## 2. Wallet Management

- [ ] **Create New Wallet**: enter an ID (e.g. `test1@example.com`), tap Create — success result with a wallet ID, and it appears in the Wallets list on Home
- [ ] **Create New Wallet** again with the *same* ID — should fail with a clear "already exists" error, not silently overwrite the first one
- [ ] **Generate Mnemonic**: tap Generate — get a real phrase back; confirm nothing was persisted (no new wallet appears in the list)
- [ ] **Import from Mnemonic**: use a phrase from the previous step (or any valid 12-word phrase) with a new ID — succeeds, appears in the list
- [ ] **Create Temporary Wallet**: tap Create — success message; confirm it does *not* appear in the Wallets list (by design)
- [ ] **Clear Temporary Wallet**: tap Clear — succeeds
- [ ] **Reveal Mnemonic (Active Wallet)**: with a wallet active, tap it — get a real phrase back matching the one used to create/import that wallet
- [ ] Per-wallet **Reveal** button in the list — same check, for a *non*-active wallet
- [ ] **Lock Active Wallet**: tap Lock — Wallet Ready badge on Home flips to unchecked
- [ ] Per-wallet **Unlock** button — flips Wallet Ready back on, and the correct wallet shows the "Active" tag
- [ ] **Delete Wallet** (manual ID card) — removes it from the list
- [ ] Per-wallet **Delete** button — same check, from the list directly

## 3. Use Account

For each of the four networks (Bitcoin, Spark, Ethereum, Tron):
- [ ] Select the network from the dropdown
- [ ] **Get Balance** returns a real result (likely `0` for an unfunded wallet — that's a real `0`, not an error)
- [ ] **Get Address** returns a real, correctly-formatted address for that network
- [ ] **Sign Message** with a test string returns a signature with no wrapping quotes or JSON artifacts (just the raw signature)
- [ ] **Verify Signature** using that exact message + signature returns `true`

Network-specific:
- [ ] **Get Static Deposit Address** card is visible *only* when Spark is selected, and disappears immediately when switching to any other network

General:
- [ ] Switch networks after getting a result on one — confirm the previous network's result does *not* linger on screen (every card should reset, not show stale data)
- [ ] With no wallet active (lock it first), confirm the warning banner appears and is visible before scrolling to any card
- [ ] **Custom Method** card: try a method name that doesn't exist — confirm you get a clear error, not a silent failure

## 4. Use Module

- [ ] Both `addressBook` and `counter` appear as pills
- [ ] **addressBook**: `getInfo` → `writable: false`
- [ ] `create` → succeeds (may take a few seconds)
- [ ] `getInfo` again → `writable: true` now
- [ ] `addContact` with `[{"name": "Test"}]` → returns a contact object with an id
- [ ] `listContacts` → array containing that contact
- [ ] Event Log (filtered to addressBook) shows `update` events after `create` and `addContact`, each with a real timestamp
- [ ] **counter**: `increment` with no args → `{value: 1}`
- [ ] `increment` again → `{value: 2}` (state persisted across calls in the same session)
- [ ] `getValue` → matches the current count
- [ ] `reset` → `{value: 0}`, and an `update` event appears in the log
- [ ] Switch from addressBook to counter — confirm the event log's filtered view switches too, and addressBook's events don't show while counter is selected
- [ ] Switch modules and confirm the Call Method card's result resets (no stale addressBook result showing while counter is selected)

## 5. Use Protocol

- [ ] `aave` appears as the configured protocol
- [ ] Select **Ethereum** — confirm the "Get Account Data (Aave)" card is visible; select any other network — confirm it's replaced by an explanatory message instead
- [ ] Tap **Get Account Data (Aave)** — returns real data (`totalCollateralBase`, `totalDebtBase`, `healthFactor`, etc.), likely all zeros/max-health-factor for a fresh wallet, but a real response, not an error. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) if this fails with `"No lending protocol registered for label: aave"` — that's a known, understood dependency issue with a confirmed fix, not a new bug
- [ ] Via the **Call Protocol Method** card, manually enter `methodName: getAccountData` and `options: {"protocolType": "lending", "protocolName": "aave"}` — should return the same result as the dedicated card above, confirming the general-purpose path works the same way
- [ ] Confirm sections 1–2 (wallet create/unlock) still pass after any change to protocol config — this is the specific check that catches the "malformed protocol entry breaks wallet operations" failure mode immediately, rather than after further, more confusing testing

## 6. Debug Log

- [ ] After working through sections 2–5 above, open Debug Log — confirm entries exist for RPC calls, results, module events, and lifecycle transitions
- [ ] Filter by each category pill — confirm the count and content actually change, not just the label
- [ ] Trigger a real error (e.g. an invalid method name) and confirm the `RPC Error` entry includes a `stack` field, not just a `message` — this is what makes a failure traceable to its actual cause rather than just its symptom
- [ ] Tap **Export** — the native share sheet opens with real, readable content (not empty, not just a header)
- [ ] Tap **Clear** — the list empties; confirm new actions still populate it afterward (clearing doesn't break capture)

## 7. Theme, across every screen

- [ ] Toggle to light theme, then visit every screen (Home, Wallet Management, Use Account, Use Module, Use Protocol, Debug Log) — confirm none of them render dark cards on a light background (or vice versa)
- [ ] On any orange/primary button, confirm the text is legible: white text in light theme, black text in dark theme
- [ ] On any non-primary (card/outline) button, confirm its text/icon reads in the orange primary color, not the default text color

## 8. `rn-core` removal — a final, direct verification

- [ ] `grep -rn "wdk-react-native-core" src/ package.json` — confirm zero real hits (comments describing its *absence* are fine; any actual import is not)
- [ ] Confirm `@tetherto/wdk-react-native-core` is not in `package.json`'s dependencies

## 9. Dependency hygiene, if `package.json` changed since the last full pass

- [ ] `npm ls @tetherto/wdk-wallet` (or whichever package was touched) shows no `invalid` markers
- [ ] `git diff package-lock.json --stat` shows a diff proportionate to the actual change made — a small deliberate change producing a huge, unexplained diff is worth stopping on before proceeding further
- [ ] Sections 0–2 above (build, launch, wallet create/unlock) re-pass specifically — dependency changes have previously broken wallet operations in ways unrelated to whatever the change was actually for

---

If every box above is checked with the expected result (not just "didn't crash"), that's a genuine, evidence-based basis for saying this is complete and working — not an assumption.
