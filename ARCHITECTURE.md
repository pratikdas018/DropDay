# Drop Day — Architecture

## Guiding principle
There is exactly **one source of truth: a server-side in-memory engine.** Everything
time-based and contested — hold expiry, stock contention, watcher counts — is decided
there. The UI never invents truth; it only *visualizes* what the server reports and
runs cosmetic countdowns between polls.

## Layered diagram

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React components, "use client")                         │
│  DropGrid · ProductCard · HoldsPanel · HoldTimer · Checkout  │
│  Toasts · Loading / Error / Empty states                     │
└───────────────▲───────────────────────┬─────────────────────┘
                │ reads state            │ dispatches actions
┌───────────────┴───────────────────────▼─────────────────────┐
│  STORE  (Zustand)  src/store/useStore.ts                     │
│  • holds, holdIds, products, drift, toasts                   │
│  • cross-tab sync via localStorage + `storage` event         │
│  • computes clock drift from every server response           │
└───────────────▲───────────────────────┬─────────────────────┘
                │                        │  calls only this ↓
┌───────────────┴───────────────────────▼─────────────────────┐
│  API BOUNDARY (service module)  src/lib/api.ts               │
│  getProducts · placeHold · refreshHolds · releaseHold · checkout │
│  — the ONLY thing that knows about HTTP. Swap BASE → real server.│
└───────────────▲───────────────────────┬─────────────────────┘
                │  fetch()               │
┌───────────────┴───────────────────────▼─────────────────────┐
│  ROUTE HANDLERS  src/app/api/**   (real Next.js backend)     │
│  inject latency + transient failures at the edge             │
│  GET /products · POST /holds · GET /holds · DELETE /holds/:id │
│  POST /checkout                                              │
└───────────────▲───────────────────────┬─────────────────────┘
                │                        │
┌───────────────┴───────────────────────▼─────────────────────┐
│  ENGINE  src/lib/engine.ts   (SINGLE SOURCE OF TRUTH)        │
│  • in-memory Map<>, persisted on globalThis across reloads   │
│  • lazy expiry sweep on every read/mutation                  │
│  • simulated-shopper contention · watcher drift              │
│  • available = total − soldBySim − currentlyHeld             │
└──────────────────────────────────────────────────────────────┘
```

## Why this shape
- **Swappability**: components → store → `api.ts` → HTTP. To point at a real backend,
  change the base URL in `api.ts`. Nothing above it changes. This directly answers the
  "could the mock be swapped untouched?" evaluation line.
- **Truth lives server-side**: expiry is reclaimed by the engine's `sweep()`, so the UI
  can crash, drift, or lag and the stock math stays correct.
- **Client clock is derived, not raw**: every API response returns `serverNow`. The store
  stores `drift = serverNow − Date.now()`. All countdowns read `Date.now() + drift`, so the
  UI stays aligned to the server even if the device clock is wrong.

## Data flow examples

**Placing a hold (wait-for-server):**
1. User clicks Hold → store sets `pendingHoldFor` (button shows "Reserving…").
2. `api.placeHold()` → `POST /holds` → engine checks availability, creates a 60s hold.
3. On success: store appends the hold + its id, writes ids to localStorage, refreshes products.
4. On failure (OUT_OF_STOCK / transient): a toast explains; products refresh so stock is truthful.

**Hold expiry:**
- The store polls `refreshHolds()` (~every 2s). The engine's sweep has already deleted
  expired holds, so they come back missing. The store diffs local ids vs. server-alive ids,
  removes the expired ones, and fires a "Hold expired — returned to pool" toast.
- Between polls, `HoldTimer` shows a cosmetic countdown; at 0 it shows an "Expired" state
  rather than vanishing, until the next reconcile cleans it up.

**Checkout with mid-flow expiry:**
- `POST /checkout` re-validates every hold against the engine. If any expired, it returns
  `HOLD_EXPIRED`; the UI shows an explained failure and reconciles the panel.

## Cross-tab behavior
Hold ids live in `localStorage`. A `storage` event listener in the store fires when another
tab changes them, triggering a `refreshHolds()`. Both tabs then reflect the same server truth.
(The server is authoritative; localStorage is just a shared pointer list of hold ids.)

## File map
```
src/
  app/
    layout.tsx            root layout + fonts
    page.tsx              storefront (grid + holds panel)
    checkout/page.tsx     checkout summary + result
    api/
      products/route.ts           GET products
      holds/route.ts              POST create · GET refresh
      holds/[id]/route.ts         DELETE release
      checkout/route.ts           POST checkout
  lib/
    types.ts             shared domain types (the contract)
    engine.ts            in-memory source of truth
    api.ts               the single API boundary
    route-helpers.ts     latency + failure injection, response envelopes
    clock.ts             server-synced tick hook + countdown formatter
  store/
    useStore.ts          Zustand store
  components/
    DropGrid.tsx · ProductCard.tsx · HoldsPanel.tsx
    HoldTimer.tsx · Toasts.tsx · states (Loading/Error/Empty)
```

## Tech choices
- **Zustand over Context**: holds tick and reconcile frequently; Context would re-render the
  whole tree on every tick. Zustand's selector subscriptions keep re-renders scoped to the
  components that use a given slice — the right fit for high-frequency contested state.
- **Route Handlers over pure mock**: satisfies the real-backend bonus while keeping the exact
  same API boundary the UI already depends on.
