# Decisions

Short rationale for the choices that shaped Drop Day.

### 1. What happens on screen the moment a hold expires

The per-hold `HoldTimer` reads server-adjusted time, so it hits `0:00` in step
with the server. In the final 10 seconds it enters **Panic Mode** (red, pulsing,
gently shaking — motion gated behind `prefers-reduced-motion`). At zero it shows
an explicit **"Expired"** label rather than vanishing. Within ~2s the holds poll
diffs local `holdIds` against the server's still-alive ids, drops the dead hold,
returns its stock to the pool, and pushes a toast: _"Hold expired: X returned to
the pool."_ The user is never left guessing why an item disappeared.

### 2. Whose clock is truth — client or API — and how drift is handled

**The API is truth.** Every response is wrapped in `ApiEnvelope<T>` carrying
`serverNow`. On each response the store computes `drift = serverNow − Date.now()`
and exposes `serverTime() = Date.now() + drift`. All countdowns render from
`serverTime()`, never raw `Date.now()`. A client with a skewed clock still sees
timers that agree with when the server will actually expire a hold.

### 3. Optimistic UI vs wait-for-server when placing a hold

**Placing a hold waits for the server.** Stock is contested (bots + other tabs +
other users), so optimistically showing a hold that the server then rejects would
be a lie about scarce inventory. We show a pending "Holding…" state and only add
the hold once the server confirms. **Release is optimistic** — it's user-initiated
and only ever frees stock, so it's safe to apply locally first (with rollback if
the request fails).

### 4. Zustand vs Context for this app

**Zustand.** This UI is dominated by high-frequency ticking (multiple independent
250ms/1s countdowns) and constant reconciliation (products every 2.5s, holds every
2s). Context would re-render the whole subtree on every state change; Zustand's
selector subscriptions mean a component re-renders only when the specific slice it
reads changes. It also gives us a clean place for cross-cutting concerns (drift,
toasts, cross-tab sync) without prop-drilling or nested providers.

### 5. What a user with two open tabs experiences

`holdIds` are persisted to `localStorage`. Each tab listens for the `storage`
event; when one tab places or releases a hold, the other re-syncs its `holdIds`
and runs `refreshHolds()` to reconcile against the server. Because the **server is
authoritative**, both tabs converge on the same truth — a hold created in tab A
appears in tab B, and an expiry seen by one is reflected in the other on the next
poll. No double-spending of stock: the engine's availability math counts all live
holds regardless of which tab created them.

### 6. Extra decision — lazy expiry sweep over per-hold timers

Expiry is enforced by a **lazy `sweep()`** that runs at the top of every engine
read/mutation, deleting any hold whose `expiresAt <= now`. This is preferred over
per-hold `setTimeout`s because: (a) serverless/route-handler invocations don't
keep long-lived timers alive reliably, (b) it keeps the engine stateless between
calls apart from the data itself, and (c) correctness only depends on _someone_
reading the engine — which the ~2s polls guarantee. The result is deterministic
and hot-reload-safe, with no dangling timers to leak.
