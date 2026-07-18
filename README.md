# Drop Day

A flash-sale storefront for limited-stock product drops. Hold an item to reserve
stock for **60 seconds**, race the timer (and the bots), then check out. Miss out?
Join a sold-out item's waitlist and get an exclusive **15-second second-chance**
when stock frees up.

> Dark _terminal-meets-hypebeast_ look, monospace live tickers, and a server-side
> engine that is the single source of truth for everything time-based and contested.

---

## What this project demonstrates

A **Next.js 14 web app** and an **Expo mobile app** in one pnpm/Turborepo monorepo,
both talking to a real backend through a **single shared API boundary** — no
duplicated types, no duplicated fetch code.

The interesting problem is **contested, time-based state**: stock that several
shoppers (and simulated bots) race for, reservations that expire on a server clock,
and a waitlist that hands freed inventory to the next person in line for exactly 15
seconds. All of that is decided server-side; the UI only visualizes it.

| | |
| --- | --- |
| **Stack** | Next.js 14 · React · TypeScript · Zustand · Tailwind · Expo / React Native |
| **Tooling** | pnpm workspaces · Turborepo |
| **Backend** | Real Next.js Route Handlers over an in-memory engine (the bonus tier, not a mock) |
| **Wildcards** | Hype Meter · Panic Mode · **Second-Chance Queue** |

### Where to look first

| If you want to see… | Open |
| --- | --- |
| The single API boundary (the only `fetch()` in the repo) | `packages/shared/src/api.ts` |
| The domain contract shared by every layer | `packages/shared/src/types.ts` |
| The source of truth — expiry sweep, stock math, queue/offers | `apps/web/src/lib/engine.ts` |
| The same boundary reused by a second client | `apps/mobile/App.tsx` |
| Why things are built this way | **DECISIONS.md** |

### The docs

- **README.md** (this file) — what it is, how to run it, key behaviors.
- **ARCHITECTURE.md** — layered diagram, data-flow walkthroughs, file map.
- **DECISIONS.md** — 11 decisions with rationale (the "why", including trade-offs).
- **PRD.md** — the original requirements and what shipped against them.

---

## Run it (≤3 commands)

```bash
pnpm install   # installs every workspace package
pnpm dev       # turbo runs the web app
```

Then open <http://localhost:3000>.

Other root scripts (all via Turborepo): `pnpm build`, `pnpm lint`, `pnpm typecheck`.
To target one package: `pnpm --filter @dropday/web <script>`.

### Mobile (Expo)

```bash
pnpm --filter @dropday/mobile start
```

Then scan the QR code with **Expo Go**, or press `a` / `i` / `w` for
Android / iOS / web. It defaults to the deployed backend; point it elsewhere with:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:3000 pnpm --filter @dropday/mobile start
```

---

## Monorepo layout

pnpm workspaces + Turborepo. Two apps, one genuinely shared package:

```text
DropDay/
├─ apps/
│  ├─ web/                  @dropday/web — the Next.js 14 app (+ the backend)
│  │  └─ src/
│  │     ├─ app/            routes + Route Handlers (the HTTP edge)
│  │     ├─ components/     client UI
│  │     ├─ lib/            engine.ts · route-helpers.ts · clock.ts (server/app-only)
│  │     └─ store/          Zustand store
│  └─ mobile/               @dropday/mobile — Expo / React Native
│     ├─ App.tsx            the one screen: scrollable drop list
│     └─ src/               config.ts (API base URL) · theme.ts
├─ packages/
│  └─ shared/               @dropday/shared — reused by BOTH apps
│     └─ src/
│        ├─ types.ts        THE CONTRACT (Product, Hold, Order, QueueInfo, ApiEnvelope…)
│        ├─ api.ts          THE SINGLE API BOUNDARY (only place that touches fetch)
│        └─ index.ts        public surface
├─ pnpm-workspace.yaml
└─ turbo.json               dev / build / lint / typecheck pipelines
```

**What's shared and why.** `@dropday/shared` holds the two things every client
genuinely agrees on: the **domain contract** (`types.ts` — imported by the engine,
the route handlers, the store, the web UI, _and_ the mobile screen) and the **API
boundary** (`api.ts` — the single service module all clients talk through). The
server engine and route helpers stay in the web app and import their types from the
shared package — so there is exactly one definition of the contract, with no
duplicated copies anywhere.

**Web and mobile call the same `api.getProducts()`.** The only difference is the
origin: the web app uses same-origin route handlers (`BASE = ""`), while the native
app has no origin and so calls `configureApi({ baseUrl })` once at startup. The
request/response contract is identical.

The package ships raw TypeScript (no build step); Next compiles it via
`transpilePackages: ["@dropday/shared"]`, and `@dropday/shared` resolves through
both the workspace symlink and a tsconfig path.

---

## ⚠️ State is IN-MEMORY

The entire backend is an in-memory engine held on `globalThis` in the Next.js
server process. **It resets on every server restart / redeploy.** On Vercel, that
means each cold start (and each serverless instance) can begin from the seed state
— there is no database. This is intentional for the assignment: it keeps the
"single source of truth" honest and easy to reason about.

---

## Architecture tour

One idea drives the whole app: **there is exactly one source of truth — a
server-side engine — and the UI only ever visualizes it.**

```text
Browser (client components)
  └─ Zustand store  ──────────────┐  drift = serverNow − Date.now()
       │ selectors, polling       │  serverTime() = Date.now() + drift
       ▼                          │
  @dropday/shared (api.ts)  ── THE ONLY place that touches fetch/HTTP
       │                          │
       ▼   (HTTP + latency + occasional transient failures)
  Route Handlers  /api/products · /api/holds · /api/holds/[id] · /api/checkout
                  /api/queue · /api/queue/claim
       │                          │
       ▼                          │
  apps/web/src/lib/engine.ts  ── in-memory source of truth (on globalThis)
       • lazy sweep() enforces 60s hold expiry on every read/mutation
       • simulateContention() — bots eat live stock over time
       • driftWatchers() — hype meter drifts
       • FIFO second-chance queue + 15s exclusive offers (escrow one unit)
       • available = totalStock − soldToSim − currentlyHeld − offerReserved
```

### Layers

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types.ts` | **Shared contract** — `Product`, `Hold`, `Order`, `QueueInfo`, `ApiEnvelope<T>`, `ApiError`. |
| `packages/shared/src/api.ts` | **The single API boundary.** Swap to a real backend by changing `BASE`. |
| `apps/web/src/lib/engine.ts` | In-memory engine. Holds, stock math, expiry sweep, queue/offers, bot contention, watcher drift. |
| `apps/web/src/lib/route-helpers.ts` | `latency()`, `maybeFail()`, `ok()`/`fail()` envelope wrappers. |
| `apps/web/src/app/api/**` | Real Route Handlers (`dynamic = "force-dynamic"`) — the HTTP edge. |
| `apps/web/src/store/useStore.ts` | Zustand: products, holds, queue/offers, drift, toasts, cross-tab sync. |
| `apps/web/src/lib/clock.ts` | `useServerTick()` + `fmtCountdown()`. Countdowns read server-adjusted time. |
| `apps/web/src/components/**` | Client UI: drop grid, holds panel, timers, toasts, checkout. |

### Key behaviors

- **Holds are reservations, not purchases.** A hold reserves stock for 60s. The
  server deletes expired holds lazily on the next read/mutation.
- **Wait-for-server on hold, optimistic on release.** Stock is contested, so we
  don't fake a successful hold; releasing is user-initiated and safe, so it's
  optimistic (with rollback).
- **Never a silent vanish.** When a hold expires, the poll diff removes it and
  fires a "returned to the pool" toast. Panic mode (red + shake) covers the final
  10 seconds; at 0 the timer reads **Expired** briefly before reconciliation.
- **Second-Chance Queue.** Join a waitlist for a sold-out product. When stock
  frees up (a hold expires/releases), the front-of-queue user gets an **exclusive
  15-second offer** — that unit is escrowed (kept out of public stock) until they
  claim it into a normal 60s hold or the window lapses. Unclaimed offers drop the
  user from the queue and pass the unit to the next person, or back to public
  stock if the queue is empty. The 15s window is **enforced by the engine**, in
  the same lazy sweep as hold expiry — never by the UI.
- **Wildcards:** _Panic Mode_ hold timers, a live _Hype Meter_ (watchers +
  "Hyped" glow), and the _Second-Chance Queue_ above.
- **Micro-interactions (motion-safe):** product-card hover lift + accent glow,
  holds that slide in and fade out (instead of vanishing), a skeleton-shimmer
  loading grid, and a gentle per-second pulse on live countdowns. All degrade to
  static under `prefers-reduced-motion`.
- **Cross-tab:** `holdIds` (and a stable per-browser `userId` for the queue) live
  in `localStorage`; a `storage` listener re-syncs and reconciles when another tab
  changes them. The server stays authoritative.

Accessibility: respects `prefers-reduced-motion`, visible keyboard focus, and
`aria-live` regions for toasts and panic countdowns.
