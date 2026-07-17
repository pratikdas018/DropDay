# Drop Day

A flash-sale storefront for limited-stock product drops. Hold an item to reserve
stock for **60 seconds**, race the timer (and the bots), then check out.

> Dark _terminal-meets-hypebeast_ look, monospace live tickers, and a server-side
> engine that is the single source of truth for everything time-based and contested.

---

## Run it (≤3 commands)

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:3000>.

Other scripts: `pnpm build`, `pnpm start`, `pnpm lint`.

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

```
Browser (client components)
  └─ Zustand store  ──────────────┐  drift = serverNow − Date.now()
       │ selectors, polling       │  serverTime() = Date.now() + drift
       ▼                          │
  src/lib/api.ts  ── THE ONLY place that touches fetch/HTTP
       │                          │
       ▼   (HTTP + latency + occasional transient failures)
  Route Handlers  /api/products · /api/holds · /api/holds/[id] · /api/checkout
       │                          │
       ▼                          │
  src/lib/engine.ts  ── in-memory source of truth (on globalThis)
       • lazy sweep() enforces 60s hold expiry on every read/mutation
       • simulateContention() — bots eat live stock over time
       • driftWatchers() — hype meter drifts
       • available = totalStock − soldToSim − currentlyHeld
```

### Layers

| File | Responsibility |
| --- | --- |
| `src/lib/types.ts` | The shared contract — `Product`, `Hold`, `Order`, `ApiEnvelope<T>`, `ApiError`. |
| `src/lib/engine.ts` | In-memory engine. Holds, stock math, expiry sweep, bot contention, watcher drift. |
| `src/lib/route-helpers.ts` | `latency()`, `maybeFail()`, `ok()`/`fail()` envelope wrappers. |
| `src/app/api/**` | Real Route Handlers (`dynamic = "force-dynamic"`) — the HTTP edge. |
| `src/lib/api.ts` | **The single API boundary.** Swap to a real backend by changing `BASE`. |
| `src/store/useStore.ts` | Zustand: products, holds, drift, toasts, cross-tab sync. |
| `src/lib/clock.ts` | `useServerTick()` + `fmtCountdown()`. Countdowns read server-adjusted time. |
| `src/components/**`, `src/app/**` | Client UI: drop grid, holds panel, timers, toasts, checkout. |

### Key behaviors

- **Holds are reservations, not purchases.** A hold reserves stock for 60s. The
  server deletes expired holds lazily on the next read/mutation.
- **Wait-for-server on hold, optimistic on release.** Stock is contested, so we
  don't fake a successful hold; releasing is user-initiated and safe, so it's
  optimistic (with rollback).
- **Never a silent vanish.** When a hold expires, the poll diff removes it and
  fires a "returned to the pool" toast. Panic mode (red + shake) covers the final
  10 seconds; at 0 the timer reads **Expired** briefly before reconciliation.
- **Two wildcards:** _Panic Mode_ hold timers and a live _Hype Meter_ (watchers +
  "Hyped" glow) on each card.
- **Cross-tab:** `holdIds` live in `localStorage`; a `storage` listener re-syncs
  and reconciles when another tab changes them. The server stays authoritative.

Accessibility: respects `prefers-reduced-motion`, visible keyboard focus, and
`aria-live` regions for toasts and panic countdowns.
