# Drop Day — Product Requirements Document (PRD)

> **Status: delivered.** Every requirement below is implemented. Sections marked
> **BONUS** went beyond the original brief.

## 1. Overview

Drop Day is a flash-sale storefront for limited-stock product drops. It emulates
real-world high-demand commerce: scheduled releases, temporary reservations
("holds"), stock contention between shoppers, and failure scenarios. It is a
frontend-focused submission with a thin real backend (Next.js Route Handlers)
behind a clean API boundary — now shared by a web app **and** a mobile app.

## 2. Goals

- Demonstrate strong modeling of **time-based, contested state**.
- Handle **unhappy paths** gracefully (hold expiry, out-of-stock, mid-checkout failure).
- Show **UI/UX craft**: urgency, scarcity, polish, responsive on mobile + desktop.
- Keep a **clean API boundary** that could be swapped for a real server untouched.

## 3. Non-Goals

Auth, real payments, a real database, or exhaustive tests. In-memory state is fine.

## 4. Core Concepts

- **Product** — an item in a drop. Status: `dropping_soon`, `live`, or `sold_out`.
- **Hold** — a 60-second reservation of one or more units. Not a purchase. Expires
  server-side; on expiry the stock returns to the pool.
- **Available stock** = `total − sold − currently-held − offer-escrowed`. Derived server-side.
- **Simulated shoppers** — background bots that consume live stock over time.
- **Second-chance offer** — an exclusive 15-second window for the front of a sold-out
  product's waitlist to claim a freed unit before it goes public.
- **Order** — the result of a successful checkout of held items.

## 5. User Stories

1. As a shopper, I see ~10 products marked Live, Dropping soon (with countdown), or Sold out.
2. As a shopper, I see remaining stock and clear scarcity/urgency cues on live items.
3. As a shopper, I can hold a live item for 60 seconds.
4. As a shopper, I see each held item's own ticking 60s timer in a holds panel.
5. As a shopper, I can manually release a hold before it expires.
6. As a shopper, when a hold expires I see a clear, graceful notice — never a silent disappearance.
7. As a shopper, I can review my holds and confirm a mock checkout ("order success").
8. As a shopper, if a hold expires mid-checkout, I get a clean, explained failure.
9. As a shopper, I experience loading, error, and empty states throughout.
10. As a shopper on a **sold-out** item, I can join a waitlist and be told my position.
11. As a waitlisted shopper, when stock frees up I get an exclusive 15-second window to claim it.
12. **BONUS** — As a shopper on my phone, I can browse the same live drops in a native app.

## 6. Functional Requirements

### 6.1 Storefront (Drop Grid)

- Render ~10 products across all three statuses.
- Live products display remaining stock and communicate scarcity/urgency by design.
- Dropping-soon products show a live countdown to their `dropsAt` time.
- Required states: **loading** (skeleton-shimmer grid), **error** (with retry), **empty**.

### 6.2 Cart / Holds Panel

- Each held item shows its own independent, ticking 60-second countdown.
- Expiry is visible and graceful (fade-out + toast) — never a silent removal.
- User can release any hold manually.
- Panel shows an empty state when there are no holds.

### 6.3 Checkout

- Summary of held items → Confirm → mock success state. No payment.
- If any hold has expired at confirm time, checkout fails with a clear explanation
  and the panel reconciles (expired items removed, user informed).

### 6.4 Data / API Layer

- All components talk to data through ONE service module (the API boundary).
- Behind it: real Next.js Route Handlers (**bonus**) over an in-memory engine.
- The layer simulates latency, occasional transient failures, and other shoppers taking stock.
- **Hold expiry is enforced by this layer, not the UI.** The UI only visualizes it.
- **BONUS** — the boundary lives in a shared workspace package and is reused verbatim
  by the mobile app; only the base URL differs.

### 6.5 Wildcard #1 — Hype Meter

- Each product shows a live "watchers" count that drifts over time (server-side).
- High watcher counts visibly influence the UI: a 🔥 **Hyped** badge, ember accent
  border, and a pulsing glow above a 300-watcher threshold.

### 6.6 Wildcard #2 — Panic Mode

- In a hold's final 10 seconds the timer turns red, pulses, and shakes.
- At zero it reads **Expired** before the poll reconciles it away.
- All motion is gated behind `prefers-reduced-motion`.

### 6.7 Wildcard #3 — Second-Chance Queue **(BONUS)**

- Users may join a FIFO waitlist for a **sold-out** product and see their position.
- When inventory frees up (a hold expires or is released), the **next user in line**
  receives an **exclusive 15-second offer** to reserve one unit.
- That unit is **escrowed** — held out of public availability and out of reach of the
  contention bots — until the offer is claimed or lapses.
- Claiming converts the escrow into a normal 60s hold. Letting it lapse drops the user
  from the queue and passes the unit to the next person, or back to public stock.
- **The 15-second window is enforced by the engine**, in the same lazy sweep as hold
  expiry — never by the UI.

### 6.8 Mobile App **(BONUS)**

- An Expo / React Native app in the same monorepo, importing the **same**
  `@dropday/shared` types and API boundary as the web app — zero duplicated code.
- One screen: a scrollable drop list showing name, price, status, remaining stock, and
  watcher count, with loading, error, empty, and pull-to-refresh states.
- A working **Hold** action placing real 60s holds through the shared boundary.

## 7. Non-Functional Requirements

- **Stack**: Next.js 14 (App Router) + React + TypeScript; Zustand; Tailwind CSS; pnpm.
- **Monorepo** (**bonus**): pnpm workspaces + Turborepo, with a genuinely shared package.
- **Responsive**: works cleanly on mobile and desktop.
- **Accessibility floor**: visible keyboard focus, reduced-motion respected, `aria-live`
  regions for toasts and panic countdowns.
- **Setup**: install + run in ≤3 commands.

## 8. Success / Evaluation Criteria

| Criterion | Where to look |
| --- | --- |
| Time-based, contested state modeling | `apps/web/src/lib/engine.ts` — lazy sweep, escrow math |
| Graceful unhappy paths | expiry toasts, `HOLD_EXPIRED` checkout, transient retries |
| UI/UX personality & polish | drop grid, panic mode, hype meter, micro-interactions |
| API boundary quality | `packages/shared/src/api.ts` — reused untouched by mobile |
| Clean, maintainable code | one contract, one boundary, layered engine/route/store/UI |

## 9. Key Product Decisions

Documented with rationale in **DECISIONS.md**:

1. What happens on screen the moment a hold expires.
2. Whose clock is truth (client vs API) and how drift is handled.
3. Optimistic UI vs wait-for-server when placing a hold, and why.
4. Zustand vs Context API, for this app specifically.
5. What a user with two open tabs experiences.
6. Lazy expiry sweep over per-hold timers.
7. Second-chance queue — escrow model and where the 15s window is enforced.
8. Identifying a "user" without auth.
9. Micro-interactions, and keeping them motion-safe.

## 10. Timebox

24 hours. Polished-and-complete beats broad-and-rough.
