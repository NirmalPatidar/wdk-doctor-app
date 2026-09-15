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
- [ ] Type a linger value (e.g. `5000`), tap **Suspend**, then immediately try a call on Use Account (e.g. `getBalance`) — the call should still complete (linger is a grace period, not an instant block) — confirms this specific, non-obvious behavior actually works as documented
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

- [ ] No protocol is currently configured — an `aave` attempt broke wallet create/unlock and was reverted (see `wdk.config.js`'s comment). Confirm the screen still loads cleanly with an empty protocol list, and its warning banner is visible and legible in both themes
- [ ] **Do not** re-attempt wiring in a protocol without first confirming the correct config shape (see `documentation/ADDING_PACKAGES.md`'s "Adding a Protocol" section) — and when you do, re-run section 2 (wallet create/unlock) immediately after, before testing the protocol itself, since that's the check that would have caught the original failure right away

## 6. Worklet POC (regression check)

- [ ] Run the full POC sequence top to bottom — every step (A0 through C16) completes as previously documented, with no new failures
- [ ] This is the one screen where "still works exactly as before" *is* the success criterion — if anything here changed behavior, something fundamental broke

## 7. Debug Log

- [ ] After working through sections 2–5 above, open Debug Log — confirm entries exist for RPC calls, results, module events, and lifecycle transitions
- [ ] Filter by each category pill — confirm the count and content actually change, not just the label
- [ ] Tap **Export** — the native share sheet opens with real, readable content (not empty, not just a header)
- [ ] Tap **Clear** — the list empties; confirm new actions still populate it afterward (clearing doesn't break capture)

## 8. Theme, across every screen

- [ ] Toggle to light theme, then visit every screen (Home, Wallet Management, Use Account, Use Module, Use Protocol, Worklet POC, Debug Log) — confirm none of them render dark cards on a light background (or vice versa)
- [ ] On any orange/primary button, confirm the text is legible: white text in light theme, black text in dark theme
- [ ] On any non-primary (card/outline) button, confirm its text/icon reads in the orange primary color, not the default text color

## 9. `rn-core` removal — a final, direct verification

- [ ] `grep -rn "wdk-react-native-core" src/ package.json` — confirm zero real hits (comments describing its *absence* are fine; any actual import is not)
- [ ] Confirm `@tetherto/wdk-react-native-core` is not in `package.json`'s dependencies

---

If every box above is checked with the expected result (not just "didn't crash"), that's a genuine, evidence-based basis for saying this is complete and working — not an assumption.
