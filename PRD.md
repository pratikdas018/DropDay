# Drop Day — Product Requirements Document (PRD)

## 1. Overview
Drop Day is a flash-sale storefront for limited-stock product drops. It emulates
real-world high-demand commerce: scheduled releases, temporary reservations
("holds"), stock contention between shoppers, and failure scenarios. It is a
frontend-focused submission with a thin real backend (Next.js Route Handlers)
behind a clean API boundary.

## 2. Goals
- Demonstrate strong modeling of **time-based, contested state**.
- Handle **unhappy paths** gracefully (hold expiry, out-of-stock, mid-checkout failure).
- Show **UI/UX craft**: urgency, scarcity, polish, responsive on mobile + desktop.
- Keep a **clean API boundary** that could be swapped for a real server untouched.

## 3. Non-Goals
Auth, real payments, a real database, or exhaustive tests. In-memory state is fine.

## 4. Core Concepts
- **Product**: an item in a drop. Has a status: `dropping_soon`, `live`, or `sold_out`.
- **Hold**: a 60-second reservation of one or more units. Not a purchase. Expires
  server-side; on expiry the stock returns to the pool.
- **Available stock** = total − sold − currently-held. Derived server-side.
- **Simulated shoppers**: background bots that consume live stock over time.
- **Order**: the result of a successful checkout of held items.

## 5. User Stories
1. As a shopper, I see ~10 products marked Live, Dropping soon (with countdown), or Sold out.
2. As a shopper, I see remaining stock and clear scarcity/urgency cues on live items.
3. As a shopper, I can hold a live item for 60 seconds (multiple units of the same product allowed).
4. As a shopper, I see each held item's own ticking 60s timer in a cart/holds panel.
5. As a shopper, I can manually release a hold before it expires.
6. As a shopper, when a hold expires I see a clear, graceful notice — never a silent disappearance.
7. As a shopper, I can review my holds and confirm a mock checkout ("order success").
8. As a shopper, if a hold expires mid-checkout, I get a clean, explained failure.
9. As a shopper, I experience loading, error, and empty states throughout.

## 6. Functional Requirements

### 6.1 Storefront (Drop Grid)
- Render ~10 products across all three statuses.
- Live products display remaining stock and communicate scarcity/urgency by design.
- Dropping-soon products show a live countdown to their `dropsAt` time.
- Required states: **loading** (initial fetch), **error** (fetch failed, with retry),
  **empty** (no products).

### 6.2 Cart / Holds Panel
- Each held item shows its own independent, ticking 60-second countdown.
- Expiry is visible and graceful (fade/label/toast) — never a silent removal.
- User can release any hold manually.
- Panel shows an empty state when there are no holds.

### 6.3 Checkout
- Summary of held items → Confirm → mock success state. No payment.
- If any hold has expired at confirm time, checkout fails with a clear explanation
  and the panel reconciles (expired items removed, user informed).

### 6.4 Data / API Layer
- All components talk to data through ONE service module (the API boundary).
- Behind it: real Next.js Route Handlers (bonus) over an in-memory engine.
- The layer simulates latency, occasional transient failures, and other shoppers taking stock.
- **Hold expiry is enforced by this layer, not the UI.** The UI only visualizes it.

### 6.5 Wildcard — Hype Meter (chosen)
- Each product shows a live "watchers" count that drifts over time.
- High watcher counts visibly influence the UI (a "Hyped" badge, accent glow, urgency emphasis).

## 7. Non-Functional Requirements
- **Stack**: Next.js (App Router) + React + TypeScript; Zustand for state; Tailwind CSS; pnpm.
- **Responsive**: works cleanly on mobile and desktop.
- **Accessibility floor**: visible keyboard focus, reduced-motion respected.
- **Setup**: install + run in ≤3 commands.

## 8. Success / Evaluation Criteria
- State modeling of time-based, contested state.
- Correct, graceful behavior on unhappy paths.
- UI/UX personality, polish, responsiveness.
- API boundary quality (swappable for a real server).
- Clean, maintainable code.

## 9. Key Product Decisions (documented in DECISIONS.md)
1. What happens on screen the moment a hold expires.
2. Whose clock is truth (client vs API) and how drift is handled.
3. Optimistic UI vs wait-for-server when placing a hold, and why.
4. Zustand vs Context API, for this app specifically.
5. What a user with two open tabs experiences.
6. (Any additional decision worth surfacing.)

## 10. Timebox
24 hours. Polished-and-complete beats broad-and-rough.
