# Decisions

Short rationale for the choices that shaped Drop Day. Decisions 1–6 cover the core
brief; 7–9 cover the second-chance queue and polish; 10–11 cover the monorepo and
the mobile app.

## 1. What happens on screen the moment a hold expires

The per-hold `HoldTimer` reads server-adjusted time, so it hits `0:00` in step
with the server. In the final 10 seconds it enters **Panic Mode** (red, pulsing,
gently shaking — motion gated behind `prefers-reduced-motion`). At zero it shows
an explicit **"Expired"** label rather than vanishing. Within ~2s the holds poll
diffs local `holdIds` against the server's still-alive ids, drops the dead hold,
returns its stock to the pool, and pushes a toast: _"Hold expired: X returned to
the pool."_ The user is never left guessing why an item disappeared.

## 2. Whose clock is truth — client or API — and how drift is handled

**The API is truth.** Every response is wrapped in `ApiEnvelope<T>` carrying
`serverNow`. On each response the store computes `drift = serverNow − Date.now()`
and exposes `serverTime() = Date.now() + drift`. All countdowns render from
`serverTime()`, never raw `Date.now()`. A client with a skewed clock still sees
timers that agree with when the server will actually expire a hold — this also
governs the 15s second-chance offer countdown (see §7).

## 3. Optimistic UI vs wait-for-server when placing a hold

**Placing a hold waits for the server.** Stock is contested (bots + other tabs +
other users), so optimistically showing a hold that the server then rejects would
be a lie about scarce inventory. We show a pending "Holding…" state and only add
the hold once the server confirms. **Release is optimistic** — it's user-initiated
and only ever frees stock, so it's safe to apply locally first (with rollback if
the request fails). Claiming a second-chance offer follows the **wait-for-server**
rule for the same reason: the exclusive window can lapse, so we confirm before
showing the resulting hold.

## 4. Zustand vs Context for this app

**Zustand.** This UI is dominated by high-frequency ticking (multiple independent
250ms/1s countdowns) and constant reconciliation (products every 2.5s, holds every
2s). Context would re-render the whole subtree on every state change; Zustand's
selector subscriptions mean a component re-renders only when the specific slice it
reads changes. It also gives us a clean place for cross-cutting concerns (drift,
toasts, cross-tab sync, queue/offer state) without prop-drilling or nested
providers.

## 5. What a user with two open tabs experiences

`holdIds` — and a stable per-browser `userId` used for the queue — are persisted to
`localStorage`. Each tab listens for the `storage` event; when one tab places or
releases a hold, the other re-syncs its `holdIds` and runs `refreshHolds()` to
reconcile against the server. Because the **server is authoritative**, both tabs
converge on the same truth — a hold created in tab A appears in tab B, and an
expiry seen by one is reflected in the other on the next poll. No double-spending
of stock: the engine's availability math counts all live holds regardless of which
tab created them.

## 6. Lazy expiry sweep over per-hold timers

Expiry is enforced by a **lazy `sweep()`** that runs at the top of every engine
read/mutation, deleting any hold whose `expiresAt <= now`. This is preferred over
per-hold `setTimeout`s because: (a) serverless/route-handler invocations don't
keep long-lived timers alive reliably, (b) it keeps the engine stateless between
calls apart from the data itself, and (c) correctness only depends on _someone_
reading the engine — which the ~2s polls guarantee. The result is deterministic
and hot-reload-safe, with no dangling timers to leak. The **second-chance offer's
15s window is expired in this same sweep** — no separate timer subsystem.

## 7. Second-Chance Queue — how freed stock is routed, and where the 15s window lives

When a sold-out product's stock frees up (a hold expires or is released), that unit
must not silently return to the public pool if someone is waiting for it. The
design:

- **FIFO queue per product**, stored server-side in the engine. Users join only
  when a product is `sold_out`.
- **Offer = escrow.** When the sweep frees a unit and a queue exists, the engine
  hands the front user an `Offer` with a 15s `expiresAt` and _escrows_ that unit:
  `available = totalStock − soldToSim − held − offerReserved`. So the freed unit is
  provably kept out of public availability — and out of reach of the contention
  bots — until the offer is claimed or expires.
- **Enforced by the engine, never the UI.** `expireOffers()` (offer lapsed → drop
  the front user, release the escrow) and `promoteQueues()` (re-offer to the next
  person, or let the unit go public if the queue is now empty) both run inside the
  same lazy sweep as hold expiry. The client only _reflects_ `QueueInfo` it reads
  back (`length`, `position`, `hasOffer`, `offerSecondsLeft`); it can't grant or
  extend a window.
- **Claim = a normal 60s hold.** `claimOffer()` converts the escrowed unit into an
  ordinary hold, so the rest of the flow (timer, checkout, cross-tab) is unchanged.
  Net stock effect of the conversion is zero — the escrow simply becomes the hold's
  reserved unit.

This keeps the "one server-side source of truth" honest: the contested, time-based
decision (who gets the freed unit, and for how long) lives entirely in the engine.

## 8. Identifying the "user" without auth

The queue needs a stable identity to know whose turn it is. Rather than add auth,
we mint a per-browser `userId` (`dropday.userId`) in `localStorage` on first load
and reuse it across polls, tabs, and reloads. It's sent to `/api/products?userId=`
so each product response carries _that user's_ queue standing, and to the
join/leave/claim endpoints. Good enough for a demo; swapping in real auth means
replacing one id source, nothing else.

## 9. Micro-interactions — tasteful, and always motion-safe

Polish is layered on without touching state logic: product-card hover lift +
accent glow, holds that **slide in and fade out** (a local presence layer keeps a
released/expired row mounted ~320ms to animate before unmounting, never mutating
the store), a **skeleton-shimmer** loading grid that mirrors the card layout, and a
gentle per-second pulse on live countdowns. Every animation is gated behind
`motion-safe:` and the global `prefers-reduced-motion` kill-switch, so the whole
experience degrades cleanly to static for users who ask for reduced motion.

## 10. What goes in the shared package — and what deliberately doesn't

The monorepo exists to prove the API boundary is genuinely swappable, so the shared
package has to be _real_, not a token folder. `@dropday/shared` contains exactly two
things — the pieces every client must agree on:

- **`types.ts`** — the contract. Imported by the engine, the route handlers, the
  Zustand store, the web UI, and the mobile screen. One definition of `Product`,
  `Hold`, `QueueInfo`; no drift between client and server.
- **`api.ts`** — the single API boundary, the only `fetch()` in the repo.

What stays **out** is just as deliberate. `engine.ts` and `route-helpers.ts` are
server-only and belong to the web app; `clock.ts` and the Zustand store are React-DOM
and web-UX concerns. Hoisting those into "shared" would have made the package a
dumping ground and coupled the mobile app to code it can't use. The test applied was:
_would a second, different client genuinely need this?_ Types and the API boundary
pass; the engine and the store don't.

The package ships **raw TypeScript with no build step** — Next compiles it via
`transpilePackages`, Metro via `watchFolders`. One source of truth, two bundlers, and
no stale `dist/` to forget to rebuild during development.

## 11. How the mobile app reuses the boundary — one base URL, nothing else

The point of the Expo app is to prove the boundary swaps cleanly, so it imports
`api`, `ApiFailure`, and the types from `@dropday/shared` and calls the **same**
`api.getProducts()` the web store calls. No duplicated types, no second fetch layer.

Only one thing genuinely differs: the web app talks to same-origin route handlers
(`BASE = ""`), while a native app has no origin to be relative to. Rather than fork
the module, `api.ts` gained a `configureApi({ baseUrl })` setter that the mobile app
calls once at startup; web keeps the same-origin default, so its behaviour is
unchanged. The request/response contract is byte-identical on both.

Two consequences fell out of going cross-origin, both handled server-side:

- **CORS.** A different origin means preflight, so the route helpers now attach CORS
  headers centrally in `ok()`/`fail()` and every route exports an `OPTIONS` handler.
  Same-origin web requests are unaffected. (Native doesn't enforce CORS, but a real
  cross-origin client — including Expo web — does.)
- **`cache: "no-store"`.** Meaningful in a browser, rejected by React Native's fetch,
  so it's sent only when running same-origin.

The mobile app keeps local `useState` instead of adopting Zustand: one screen with one
fetch doesn't have the high-frequency ticking that justified a store on the web, and
the shared package intentionally stops at the boundary rather than dictating state
management to every client.
