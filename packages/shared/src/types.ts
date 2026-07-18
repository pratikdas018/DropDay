// ============================================================================
// Drop Day — shared domain types (THE CONTRACT)
// These types are the single agreed shape between the server engine, the API
// boundary, the store, and the UI. If it isn't here, it isn't part of the deal.
// ============================================================================

export const HOLD_DURATION_MS = 60_000;

/** Second-Chance Queue: exclusive window to claim freed stock before it goes public. */
export const OFFER_DURATION_MS = 15_000;

export type ProductStatus = "dropping_soon" | "live" | "sold_out";

/**
 * Per-user, per-product Second-Chance Queue state. This is what a given user
 * sees about a product's waitlist — never the whole queue, just their standing.
 */
export interface QueueInfo {
  /** Total people waiting in this product's queue. */
  length: number;
  /** Is the requesting user currently in this queue (waiting, no active offer)? */
  queued: boolean;
  /** 1-based position in the queue if queued (front = 1); null otherwise. */
  position: number | null;
  /** Does the requesting user hold the active 15s exclusive offer right now? */
  hasOffer: boolean;
  /** Whole seconds left on that offer (0 when none). */
  offerSecondsLeft: number;
}

export interface Product {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Hex colorway that drives the gradient swatch (image stand-in). */
  colorway: string;
  /** Epoch ms when the drop goes live. */
  dropsAt: number;
  totalStock: number;
  /** Derived server-side: totalStock − soldToSimShoppers − currentlyHeld − offerReserved. */
  available: number;
  /** Live hype-meter count; drifts over time. */
  watchers: number;
  status: ProductStatus;
  /** Second-Chance Queue standing for the requesting user (present when a userId is supplied). */
  queue?: QueueInfo;
}

export interface Hold {
  id: string;
  productId: string;
  productName: string;
  colorway: string;
  price: number;
  qty: number;
  createdAt: number;
  expiresAt: number;
}

export interface OrderItem {
  productName: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  placedAt: number;
}

/** Every successful response carries the server clock so clients can de-drift. */
export interface ApiEnvelope<T> {
  data: T;
  serverNow: number;
}

export type ApiErrorCode =
  | "OUT_OF_STOCK"
  | "HOLD_EXPIRED"
  | "HOLD_NOT_FOUND"
  | "NOT_LIVE"
  | "TRANSIENT"
  | "EMPTY_CART"
  | "NO_OFFER"
  | "NOT_SOLD_OUT"
  | "BAD_REQUEST";

export interface ApiError {
  error: string;
  code: ApiErrorCode;
  serverNow: number;
  /** Present on HOLD_EXPIRED from checkout: which hold ids failed. */
  expiredHoldIds?: string[];
}
