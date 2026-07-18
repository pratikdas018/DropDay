// ============================================================================
// Drop Day — the in-memory ENGINE (server-side single source of truth).
//
// Everything time-based and contested is decided HERE, never in the UI:
//   • Holds are 60s reservations, not purchases.
//   • Hold expiry is enforced by a LAZY SWEEP on every read/mutation.
//   • Simulated background shoppers consume live stock over time.
//   • available = totalStock − soldToSim − currentlyHeld  (derived here).
//
// The engine is persisted on globalThis so it survives Next.js hot reloads and
// route invocations within one server process.
// ============================================================================

import {
  HOLD_DURATION_MS,
  OFFER_DURATION_MS,
  type Hold,
  type Order,
  type Product,
  type ProductStatus,
  type QueueInfo,
} from "@dropday/shared";

// --- Internal records (server-only; never leave the engine as-is) -----------

/**
 * A live Second-Chance offer: the front-of-queue user's exclusive 15s window.
 * While it exists it ESCROWS one unit — that unit is subtracted from public
 * `available` so nobody else can grab it until the offer is claimed or expires.
 */
interface Offer {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface ProductRecord {
  id: string;
  name: string;
  blurb: string;
  price: number;
  colorway: string;
  /** Offset relative to boot time; resolved to an absolute dropsAt at seed. */
  dropOffsetMs: number;
  dropsAt: number;
  totalStock: number;
  soldToSim: number;
  watchers: number;
  /** Force sold-out at seed regardless of stock math (the 2 seeded sold-outs). */
  seededSoldOut: boolean;
  /** Second-Chance Queue: FIFO userIds waiting (excludes anyone with the active offer). */
  queue: string[];
  /** The current exclusive offer for this product, if any (escrows one unit). */
  offer: Offer | null;
}

interface EngineState {
  bootAt: number;
  products: ProductRecord[];
  holds: Map<string, Hold>;
  orders: Order[];
  seq: number;
}

// ----------------------------------------------------------------------------
// Seed data. A mix of live, dropping-soon (staggered), and 2 seeded sold-out.
// dropOffsetMs is relative to boot so demos always have fresh countdowns.
// ----------------------------------------------------------------------------

function seedProducts(bootAt: number): ProductRecord[] {
  const defs: Array<Omit<ProductRecord, "dropsAt" | "soldToSim" | "queue" | "offer">> = [
    {
      id: "volt-runner",
      name: "Volt Runner OG",
      blurb: "Reactive-foam trainer. The one everyone camps for.",
      price: 189,
      colorway: "#D6FB4F",
      dropOffsetMs: -60_000, // already live
      totalStock: 8,
      watchers: 412,
      seededSoldOut: false,
    },
    {
      id: "ember-parka",
      name: "Ember Storm Parka",
      blurb: "Sealed-seam shell in molten ember. 800-fill.",
      price: 340,
      colorway: "#FF5A36",
      dropOffsetMs: -60_000, // live
      totalStock: 5,
      watchers: 271,
      seededSoldOut: false,
    },
    {
      id: "ice-hoodie",
      name: "Cryo Tech Hoodie",
      blurb: "Brushed-back fleece, glacial wash. Heavyweight.",
      price: 120,
      colorway: "#5AC8FF",
      dropOffsetMs: -60_000, // live
      totalStock: 14,
      watchers: 156,
      seededSoldOut: false,
    },
    {
      id: "mono-cargo",
      name: "Monolith Cargo",
      blurb: "Ripstop cargo with mag-snap pockets. Tapered.",
      price: 155,
      colorway: "#8A8A99",
      dropOffsetMs: -60_000, // live
      totalStock: 3,
      watchers: 98,
      seededSoldOut: false,
    },
    {
      id: "flux-tee",
      name: "Flux Grid Tee",
      blurb: "230gsm boxy tee, reflective grid print.",
      price: 65,
      colorway: "#B6FF7A",
      dropOffsetMs: 25_000, // dropping soon (~25s)
      totalStock: 20,
      watchers: 342,
      seededSoldOut: false,
    },
    {
      id: "null-cap",
      name: "Null Trucker",
      blurb: "Structured 6-panel, rubberized wordmark.",
      price: 45,
      colorway: "#7A5AFF",
      dropOffsetMs: 55_000, // dropping soon (~55s)
      totalStock: 30,
      watchers: 121,
      seededSoldOut: false,
    },
    {
      id: "prism-shorts",
      name: "Prism Track Shorts",
      blurb: "4-way stretch, iridescent piping. 5\" inseam.",
      price: 80,
      colorway: "#FF7AD6",
      dropOffsetMs: 95_000, // dropping soon (~1.5m)
      totalStock: 18,
      watchers: 87,
      seededSoldOut: false,
    },
    {
      id: "onyx-boot",
      name: "Onyx Field Boot",
      blurb: "Vulcanized sole, waxed-canvas upper. Limited run.",
      price: 260,
      colorway: "#3A3A44",
      dropOffsetMs: 140_000, // dropping soon (~2.3m)
      totalStock: 6,
      watchers: 203,
      seededSoldOut: false,
    },
    {
      id: "halo-runner",
      name: "Halo Runner (Retro)",
      blurb: "Deadstock retro re-release. Never restocking.",
      price: 210,
      colorway: "#FFC94F",
      dropOffsetMs: -300_000, // was live, sold out
      totalStock: 10,
      watchers: 540,
      seededSoldOut: true,
    },
    {
      id: "vapor-jacket",
      name: "Vapor Coach Jacket",
      blurb: "Translucent ripstop coach jacket. Iconic.",
      price: 175,
      colorway: "#A0F0E0",
      dropOffsetMs: -300_000,
      totalStock: 7,
      watchers: 389,
      seededSoldOut: true,
    },
  ];

  return defs.map((d) => ({
    ...d,
    dropsAt: bootAt + d.dropOffsetMs,
    soldToSim: 0,
    queue: [],
    offer: null,
  }));
}

// ----------------------------------------------------------------------------
// globalThis persistence
// ----------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __DROP_DAY_ENGINE__: EngineState | undefined;
}

function createState(): EngineState {
  const bootAt = Date.now();
  return {
    bootAt,
    products: seedProducts(bootAt),
    holds: new Map(),
    orders: [],
    seq: 0,
  };
}

function getState(): EngineState {
  if (!globalThis.__DROP_DAY_ENGINE__) {
    globalThis.__DROP_DAY_ENGINE__ = createState();
  }
  return globalThis.__DROP_DAY_ENGINE__;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function nextId(prefix: string): string {
  const s = getState();
  s.seq += 1;
  return `${prefix}_${s.seq.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

function heldQtyFor(productId: string): number {
  const s = getState();
  let total = 0;
  for (const h of s.holds.values()) {
    if (h.productId === productId) total += h.qty;
  }
  return total;
}

function statusFor(p: ProductRecord, available: number, nowMs: number): ProductStatus {
  if (p.seededSoldOut) return "sold_out";
  if (nowMs < p.dropsAt) return "dropping_soon";
  if (available <= 0) return "sold_out";
  return "live";
}

/** One unit is escrowed while an active offer exists (kept out of public stock). */
function offerReservedFor(p: ProductRecord): number {
  return p.offer ? 1 : 0;
}

function availableFor(p: ProductRecord): number {
  const raw = p.totalStock - p.soldToSim - heldQtyFor(p.id) - offerReservedFor(p);
  return Math.max(0, raw);
}

/** Build the requesting user's queue standing for a product (undefined if no user). */
function queueInfoFor(
  p: ProductRecord,
  userId: string | undefined,
  nowMs: number,
): QueueInfo | undefined {
  if (!userId) return undefined;
  const hasOffer = p.offer?.userId === userId;
  const offerSecondsLeft =
    hasOffer && p.offer ? Math.max(0, Math.ceil((p.offer.expiresAt - nowMs) / 1000)) : 0;
  const idx = p.queue.indexOf(userId);
  return {
    length: p.queue.length,
    queued: idx !== -1,
    position: idx !== -1 ? idx + 1 : null,
    hasOffer,
    offerSecondsLeft,
  };
}

function toProduct(p: ProductRecord, nowMs: number, userId?: string): Product {
  const available = availableFor(p);
  return {
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    price: p.price,
    colorway: p.colorway,
    dropsAt: p.dropsAt,
    totalStock: p.totalStock,
    available,
    watchers: p.watchers,
    status: statusFor(p, available, nowMs),
    queue: queueInfoFor(p, userId, nowMs),
  };
}

function findProduct(productId: string): ProductRecord | undefined {
  return getState().products.find((p) => p.id === productId);
}

// ----------------------------------------------------------------------------
// Lazy sweep + background simulation (called on every read/mutation)
// ----------------------------------------------------------------------------

/** Delete holds whose expiresAt <= now. This is how expiry is ENFORCED. */
function sweep(nowMs: number): void {
  const s = getState();
  for (const [id, h] of s.holds) {
    if (h.expiresAt <= nowMs) s.holds.delete(id);
  }
  // Second-Chance Queue is enforced in the SAME lazy pass, right after holds
  // are reclaimed: expire stale offers first, then (re)offer any free stock to
  // the front of each product's queue before it can return to public stock.
  expireOffers(nowMs);
  promoteQueues(nowMs);
}

/**
 * Expire unclaimed 15s offers. The front user forfeits their turn: they're
 * dropped from the queue and the escrowed unit is released (promoteQueues will
 * immediately re-offer it to the next person, or let it go public if none).
 */
function expireOffers(nowMs: number): void {
  const s = getState();
  for (const p of s.products) {
    if (p.offer && p.offer.expiresAt <= nowMs) {
      p.offer = null; // escrow released
    }
  }
}

/**
 * For each product with waiting users and NO active offer, if a unit is now
 * free, hand the front user an exclusive 15s offer that escrows that unit.
 * This is what makes freed stock route through the queue before going public.
 */
function promoteQueues(nowMs: number): void {
  const s = getState();
  for (const p of s.products) {
    if (p.offer) continue; // one offer per product at a time
    if (p.queue.length === 0) continue;
    // Free-but-not-yet-escrowed units. (offerReservedFor is 0 here since no offer.)
    const freeStock = p.totalStock - p.soldToSim - heldQtyFor(p.id);
    if (freeStock <= 0) continue;
    const userId = p.queue.shift()!; // front of the FIFO
    p.offer = {
      userId,
      createdAt: nowMs,
      expiresAt: nowMs + OFFER_DURATION_MS,
    };
  }
}

/**
 * Each live product has a ~15–20% chance per call to lose one unit to a bot,
 * so long as there's uncommitted stock to lose (never eat into active holds).
 */
function simulateContention(nowMs: number): void {
  const s = getState();
  for (const p of s.products) {
    if (p.seededSoldOut) continue;
    if (nowMs < p.dropsAt) continue; // not live yet
    const held = heldQtyFor(p.id);
    // Never eat into active holds OR a unit escrowed for a Second-Chance offer.
    const freeStock = p.totalStock - p.soldToSim - held - offerReservedFor(p);
    if (freeStock <= 0) continue;
    const chance = 0.15 + Math.random() * 0.05; // 15–20%
    if (Math.random() < chance) {
      p.soldToSim += 1;
    }
  }
}

/** Nudge watcher counts up/down so the hype meter feels alive. */
function driftWatchers(): void {
  const s = getState();
  for (const p of s.products) {
    const delta = Math.round((Math.random() - 0.45) * 9); // slight upward bias
    p.watchers = Math.max(0, p.watchers + delta);
  }
}

// ----------------------------------------------------------------------------
// Public engine API
// ----------------------------------------------------------------------------

export function now(): number {
  return Date.now();
}

export function listProducts(userId?: string): Product[] {
  const nowMs = now();
  sweep(nowMs);
  simulateContention(nowMs);
  driftWatchers();
  // Contention/drift can free or consume stock; re-run the queue pass so offers
  // reflect the freshest state within this same request.
  promoteQueues(nowMs);
  return getState().products.map((p) => toProduct(p, nowMs, userId));
}

export type PlaceHoldResult =
  | { ok: true; hold: Hold }
  | { ok: false; code: "NOT_LIVE" | "OUT_OF_STOCK" | "HOLD_NOT_FOUND"; message: string };

export function placeHold(productId: string, qty: number): PlaceHoldResult {
  const nowMs = now();
  sweep(nowMs);

  const p = findProduct(productId);
  if (!p) {
    return { ok: false, code: "HOLD_NOT_FOUND", message: "Product not found." };
  }

  const q = Math.max(1, Math.floor(qty || 1));

  const available = availableFor(p);
  const status = statusFor(p, available, nowMs);

  if (status === "dropping_soon") {
    return { ok: false, code: "NOT_LIVE", message: "This drop isn't live yet." };
  }
  if (status === "sold_out" || available <= 0) {
    return { ok: false, code: "OUT_OF_STOCK", message: "Sold out — no stock left to hold." };
  }
  if (q > available) {
    return {
      ok: false,
      code: "OUT_OF_STOCK",
      message: `Only ${available} left — can't hold ${q}.`,
    };
  }

  const hold: Hold = {
    id: nextId("hold"),
    productId: p.id,
    productName: p.name,
    colorway: p.colorway,
    price: p.price,
    qty: q,
    createdAt: nowMs,
    expiresAt: nowMs + HOLD_DURATION_MS,
  };
  getState().holds.set(hold.id, hold);
  return { ok: true, hold };
}

/** Return still-alive holds for the given ids (after a sweep). */
export function listHolds(ids: string[]): Hold[] {
  const nowMs = now();
  sweep(nowMs);
  const s = getState();
  const out: Hold[] = [];
  for (const id of ids) {
    const h = s.holds.get(id);
    if (h) out.push(h);
  }
  return out;
}

export function releaseHold(id: string): boolean {
  const nowMs = now();
  sweep(nowMs);
  return getState().holds.delete(id);
}

export type CheckoutResult =
  | { ok: true; order: Order }
  | { ok: false; code: "EMPTY_CART"; message: string }
  | { ok: false; code: "HOLD_EXPIRED"; message: string; expiredHoldIds: string[] };

export function checkout(holdIds: string[]): CheckoutResult {
  const nowMs = now();
  sweep(nowMs);
  const s = getState();

  if (!holdIds || holdIds.length === 0) {
    return { ok: false, code: "EMPTY_CART", message: "No holds to check out." };
  }

  // If ANY requested hold is gone (expired/missing), the whole checkout fails.
  const expired: string[] = [];
  const live: Hold[] = [];
  for (const id of holdIds) {
    const h = s.holds.get(id);
    if (h) live.push(h);
    else expired.push(id);
  }

  if (expired.length > 0) {
    return {
      ok: false,
      code: "HOLD_EXPIRED",
      message: "One or more holds expired before checkout.",
      expiredHoldIds: expired,
    };
  }

  // Consume the holds: convert reserved stock into sold, then delete the holds.
  const order: Order = {
    id: nextId("order"),
    items: live.map((h) => ({ productName: h.productName, qty: h.qty, price: h.price })),
    total: live.reduce((sum, h) => sum + h.price * h.qty, 0),
    placedAt: nowMs,
  };

  for (const h of live) {
    const p = findProduct(h.productId);
    if (p) p.soldToSim += h.qty; // reservation becomes a real sale
    s.holds.delete(h.id);
  }

  s.orders.push(order);
  return { ok: true, order };
}

// ----------------------------------------------------------------------------
// Second-Chance Queue — public API
//
// All mutations run a sweep first so offers/queues are current before we act.
// The 15s offer window is created and expired ENTIRELY here in the engine; the
// UI only reflects state it reads back.
// ----------------------------------------------------------------------------

export type QueueResult =
  | { ok: true; queue: QueueInfo }
  | { ok: false; code: "NOT_SOLD_OUT" | "HOLD_NOT_FOUND" | "BAD_REQUEST"; message: string };

/** Join the FIFO waitlist for a SOLD-OUT product. Idempotent per user. */
export function joinQueue(productId: string, userId: string): QueueResult {
  const nowMs = now();
  sweep(nowMs);

  if (!userId) return { ok: false, code: "BAD_REQUEST", message: "Missing user id." };
  const p = findProduct(productId);
  if (!p) return { ok: false, code: "HOLD_NOT_FOUND", message: "Product not found." };

  const available = availableFor(p);
  const status = statusFor(p, available, nowMs);
  // Only sold-out products have a waitlist. If it's live/available, no queue.
  if (status !== "sold_out") {
    return { ok: false, code: "NOT_SOLD_OUT", message: "This drop isn't sold out — just hold it." };
  }

  // Already has the active offer, or already queued → idempotent no-op success.
  const alreadyOffered = p.offer?.userId === userId;
  if (!alreadyOffered && !p.queue.includes(userId)) {
    p.queue.push(userId);
  }
  return { ok: true, queue: queueInfoFor(p, userId, nowMs)! };
}

/** Leave the queue. If the user holds the active offer, forfeit it (release escrow). */
export function leaveQueue(productId: string, userId: string): QueueResult {
  const nowMs = now();
  sweep(nowMs);

  if (!userId) return { ok: false, code: "BAD_REQUEST", message: "Missing user id." };
  const p = findProduct(productId);
  if (!p) return { ok: false, code: "HOLD_NOT_FOUND", message: "Product not found." };

  p.queue = p.queue.filter((u) => u !== userId);
  if (p.offer?.userId === userId) {
    p.offer = null; // forfeit the exclusive window; escrow released
    promoteQueues(nowMs); // hand it to the next person immediately, if any
  }
  return { ok: true, queue: queueInfoFor(p, userId, nowMs)! };
}

export type ClaimResult =
  | { ok: true; hold: Hold }
  | { ok: false; code: "NO_OFFER" | "HOLD_NOT_FOUND"; message: string };

/**
 * Claim the exclusive offer → convert the escrowed unit into a normal 60s hold.
 * Net stock effect is identical to a regular hold: the escrow simply becomes the
 * hold's reserved unit, so `available` is unchanged by the conversion.
 */
export function claimOffer(productId: string, userId: string): ClaimResult {
  const nowMs = now();
  sweep(nowMs);

  const p = findProduct(productId);
  if (!p) return { ok: false, code: "HOLD_NOT_FOUND", message: "Product not found." };

  if (!p.offer || p.offer.userId !== userId || p.offer.expiresAt <= nowMs) {
    return { ok: false, code: "NO_OFFER", message: "Your reservation window has passed." };
  }

  // Consume the offer and mint a hold for the escrowed unit.
  p.offer = null;
  const hold: Hold = {
    id: nextId("hold"),
    productId: p.id,
    productName: p.name,
    colorway: p.colorway,
    price: p.price,
    qty: 1,
    createdAt: nowMs,
    expiresAt: nowMs + HOLD_DURATION_MS,
  };
  getState().holds.set(hold.id, hold);
  return { ok: true, hold };
}

/** Read a single product's queue standing for a user (after a sweep). */
export function getQueueState(productId: string, userId: string): QueueInfo | null {
  const nowMs = now();
  sweep(nowMs);
  const p = findProduct(productId);
  if (!p) return null;
  return queueInfoFor(p, userId, nowMs) ?? null;
}
