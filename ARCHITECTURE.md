# Drop Day — Architecture

> **TL;DR for a first-time reader:** one server-side engine owns all contested,
> time-based truth. Every client (web + mobile) reaches it through a single shared
> API module. The UI never invents state — it only visualizes what the server says.

---

## Guiding principle

There is exactly **one source of truth: a server-side in-memory engine.** Everything
time-based and contested — hold expiry, the 15-second second-chance window, stock
contention, watcher counts — is decided there. The UI runs cosmetic countdowns
between polls, but the server always has the final word.

---

## The monorepo at a glance

```text
DropDay/                        pnpm workspaces + Turborepo
├─ apps/
│  ├─ web/      @dropday/web     Next.js 14 storefront + the backend (Route Handlers)
│  └─ mobile/   @dropday/mobile  Expo / React Native — one screen, same data
└─ packages/
   └─ shared/   @dropday/shared  the contract (types) + the API boundary
```

**Why a monorepo?** Two clients need the same contract. Putting `types.ts` and
`api.ts` in a shared package means there is exactly **one** definition of `Product`
and exactly **one** `getProducts()` — no drift between web and mobile, no copy-paste.

---

## Layered diagram

```text
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  WEB UI (Next.js, React)     │   │  MOBILE UI (Expo / RN)       │
│  DropGrid · ProductCard      │   │  App.tsx — drop list screen  │
│  HoldsPanel · HoldTimer      │   │  loading / error / refresh   │
│  Checkout · Toasts           │   │                              │
└──────────────▲───────────────┘   └──────────────▲───────────────┘
               │                                   │
┌──────────────┴───────────────┐                   │
│  STORE (Zustand)             │                   │ (local useState —
│  products · holds · drift    │                   │  no store needed
│  queue/offers · toasts       │                   │  for one screen)
│  cross-tab sync              │                   │
└──────────────▲───────────────┘                   │
               │                                   │
┌──────────────┴───────────────────────────────────┴───────────────┐
│  API BOUNDARY   @dropday/shared/api.ts        ◄── SHARED         │
│  getProducts · placeHold · refreshHolds · releaseHold · checkout │
│  joinQueue · leaveQueue · claimOffer                             │
│  The ONLY code in the repo that touches fetch().                 │
│  configureApi({ baseUrl }) → web uses same-origin, mobile absolute│
└──────────────▲───────────────────────────────────────────────────┘
               │  HTTP (+ injected latency & ~5% transient failures)
┌──────────────┴───────────────────────────────────────────────────┐
│  ROUTE HANDLERS   apps/web/src/app/api/**    (a real backend)    │
│  /products · /holds · /holds/[id] · /checkout                    │
│  /queue · /queue/claim         (+ CORS & OPTIONS for mobile)     │
└──────────────▲───────────────────────────────────────────────────┘
               │
┌──────────────┴───────────────────────────────────────────────────┐
│  ENGINE   apps/web/src/lib/engine.ts     ◄── SINGLE SOURCE OF TRUTH│
│  • in-memory Maps, persisted on globalThis across hot reloads     │
│  • lazy sweep() on every read/mutation enforces 60s hold expiry   │
│  • …and expires unclaimed 15s second-chance offers in the same pass│
│  • promoteQueues() routes freed stock to the front of the queue   │
│  • simulateContention() — bots eat live stock over time           │
│  • available = total − soldToSim − currentlyHeld − offerReserved   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Why this shape

- **Swappability.** UI → store → `@dropday/shared/api.ts` → HTTP. To point at a
  different backend you change one base URL. Nothing above it changes — which is
  exactly what the mobile app proves: it reuses the boundary untouched and just
  supplies a different origin.
- **Truth lives server-side.** Expiry is reclaimed by the engine's `sweep()`, so
  the UI can lag, drift, or crash and the stock math stays correct.
- **The client clock is derived, not raw.** Every response carries `serverNow`;
  the store keeps `drift = serverNow − Date.now()` and all countdowns read
  `Date.now() + drift`. A device with a wrong clock still shows honest timers.

---

## Data flow examples

**Placing a hold (wait-for-server):**

1. User taps Hold → store sets `pendingHoldFor` (button shows "Holding…").
2. `api.placeHold()` → `POST /api/holds` → engine checks availability, creates a 60s hold.
3. Success: store appends the hold, persists its id to `localStorage`, refreshes products.
4. Failure (`OUT_OF_STOCK` / transient): a toast explains; products refresh so stock stays truthful.

**Hold expiry:**

- The store polls `refreshHolds()` (~2s). The engine's sweep has already deleted expired
  holds, so they come back missing. The store diffs local ids against server-alive ids,
  removes the dead ones, and fires a *"returned to the pool"* toast.
- Between polls `HoldTimer` runs a cosmetic countdown; at 0 it shows **Expired**
  rather than vanishing, until the next reconcile removes it.

**Checkout with mid-flow expiry:**

- `POST /api/checkout` re-validates every hold. If any expired it returns `HOLD_EXPIRED`
  plus the offending ids; the UI shows an explained failure and reconciles the panel.

**Second-chance queue (the headline wildcard):**

1. Product is sold out → user taps **Join waitlist** → `POST /api/queue`.
2. A hold elsewhere expires or is released. The engine's sweep frees that unit.
3. `promoteQueues()` immediately **escrows** the unit for the front-of-queue user and
   opens a 15-second `Offer`. Crucially, `available` stays 0 — the unit is *not* public,
   and the contention bots can't eat it.
4. That user's next poll shows `hasOffer: true` → the card flips to an urgent
   **"Claim now — 15s"** state with a live countdown.
5. **Claim** → `POST /api/queue/claim` converts the escrow into an ordinary 60s hold.
   **Ignore it** → the sweep expires the offer, drops them from the queue, and passes
   the unit to the next person (or back to public stock if nobody's waiting).

---

## Cross-tab behavior

Hold ids and a stable per-browser `userId` live in `localStorage`. A `storage` event
listener re-syncs and calls `refreshHolds()` when another tab changes them. Both tabs
converge on the same server truth; `localStorage` is only a shared pointer list.

---

## File map

```text
packages/shared/src/
  types.ts          THE CONTRACT — Product, Hold, Order, QueueInfo, ApiEnvelope, ApiError
  api.ts            THE API BOUNDARY — the only fetch() in the repo
  index.ts          public surface ("@dropday/shared")

apps/web/src/
  app/
    layout.tsx · page.tsx           storefront (grid + holds panel)
    checkout/page.tsx               checkout summary + result
    api/
      products/route.ts             GET products (+ per-user queue info)
      holds/route.ts                POST create · GET refresh
      holds/[id]/route.ts           DELETE release
      checkout/route.ts             POST checkout
      queue/route.ts                POST join · DELETE leave
      queue/claim/route.ts          POST claim the 15s offer
  lib/
    engine.ts                       in-memory source of truth
    route-helpers.ts                latency + failure injection, envelopes, CORS
    clock.ts                        server-synced tick hook + countdown formatter
  store/useStore.ts                 Zustand store
  components/                       DropGrid · ProductCard · HoldsPanel · HoldTimer
                                    Toasts · States (Loading/Error/Empty/Skeleton)

apps/mobile/
  App.tsx                           the one screen (drop list)
  src/config.ts                     API base URL (EXPO_PUBLIC_API_BASE_URL)
  src/theme.ts                      palette mirroring the web app
  metro.config.js                   resolves the pnpm workspace symlinks
```

---

## Tech choices

- **Zustand over Context** — holds tick and reconcile constantly; Context re-renders the
  whole tree on every tick, while Zustand's selector subscriptions keep re-renders scoped
  to the components reading a given slice.
- **Route Handlers over a pure mock** — a real backend (the bonus tier) behind the exact
  same API boundary the UI already depended on.
- **Shared package ships raw TypeScript** — no build step to keep in sync. Next compiles it
  via `transpilePackages`; Metro compiles it via `watchFolders`. One source, two bundlers.
- **Turborepo** — caches `build`/`lint`/`typecheck` across packages and runs `dev` as a
  persistent task.
