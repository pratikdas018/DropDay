// ============================================================================
// Drop Day — Zustand store.
//
// Chosen over Context because this app has high-frequency ticking + reconciling
// state; selector subscriptions avoid the whole-tree re-renders Context causes.
//
// Time model: the API is truth. Every response carries serverNow; we store the
// drift = serverNow − Date.now() and expose serverTime() = Date.now() + drift.
// ============================================================================

"use client";

import { create } from "zustand";
import { api, ApiFailure } from "@/lib/api";
import type { Hold, Product } from "@/lib/types";

const HOLD_IDS_KEY = "dropday.holdIds";
const USER_ID_KEY = "dropday.userId";

export type ProductsState = "idle" | "loading" | "ready" | "error";

export type ToastKind = "info" | "success" | "error" | "expiry";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface StoreState {
  products: Product[];
  productsState: ProductsState;
  productsError: string | null;

  holdIds: string[];
  holds: Hold[];

  /** serverNow − Date.now(), recomputed on every response. */
  drift: number;

  toasts: Toast[];

  /** productId currently awaiting a placeHold response (wait-for-server). */
  pendingHoldFor: string | null;

  /** Stable per-browser identity for the Second-Chance Queue. */
  userId: string;
  /** productId currently awaiting a join/leave/claim response. */
  pendingQueueFor: string | null;
  /** productIds for which we've already toasted the current active offer (de-dupe). */
  offeredProductIds: string[];

  // time
  serverTime: () => number;
  applyDrift: (serverNow: number) => void;

  // products
  loadProducts: () => Promise<void>;
  pollProducts: () => Promise<void>;

  // holds
  placeHold: (productId: string, qty?: number) => Promise<void>;
  releaseHold: (id: string) => Promise<void>;
  refreshHolds: () => Promise<void>;

  // second-chance queue
  joinQueue: (productId: string) => Promise<void>;
  leaveQueue: (productId: string) => Promise<void>;
  claimOffer: (productId: string) => Promise<void>;

  // toasts
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;

  // cross-tab sync
  syncHoldIdsFromStorage: () => void;
}

// --- localStorage helpers (SSR-safe) ---------------------------------------

function readHoldIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HOLD_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeHoldIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOLD_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Stable per-browser id for the Second-Chance Queue (no auth). Persisted so the
 * same identity is used across polls, tabs, and reloads. Reused as the single
 * "user" for both queue membership and offers.
 */
function readOrCreateUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const created = `u_${uid()}${uid()}`;
    window.localStorage.setItem(USER_ID_KEY, created);
    return created;
  } catch {
    // Privacy mode / no storage: fall back to an ephemeral in-memory id.
    return `u_${uid()}${uid()}`;
  }
}

/**
 * After each products response, detect the transition into "you have an active
 * offer" and fire a prominent toast exactly once per offer. De-dupe via
 * offeredProductIds; clear the marker when the offer is gone so the NEXT offer
 * (e.g. a later turn in the queue) notifies again.
 */
function reconcileOffers(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
  products: Product[],
): void {
  const already = get().offeredProductIds;
  const withOffer = products
    .filter((p) => p.queue?.hasOffer && (p.queue?.offerSecondsLeft ?? 0) > 0)
    .map((p) => p.id);

  // New offers we haven't toasted yet.
  const fresh = withOffer.filter((id) => !already.includes(id));
  for (const id of fresh) {
    const p = products.find((x) => x.id === id);
    if (p) {
      get().pushToast(
        "success",
        `🎟️ Your turn! ${p.name} is reserved for you — claim within 15s.`,
      );
    }
  }

  // Drop markers for products where the offer is no longer active.
  const next = [...already.filter((id) => withOffer.includes(id)), ...fresh];
  const changed =
    next.length !== already.length || next.some((id, i) => id !== already[i]);
  if (changed) set({ offeredProductIds: next });
}

export const useStore = create<StoreState>((set, get) => ({
  products: [],
  productsState: "idle",
  productsError: null,

  holdIds: readHoldIds(),
  holds: [],

  drift: 0,

  toasts: [],

  pendingHoldFor: null,

  userId: readOrCreateUserId(),
  pendingQueueFor: null,
  offeredProductIds: [],

  // -- time -----------------------------------------------------------------
  serverTime: () => Date.now() + get().drift,

  applyDrift: (serverNow: number) => {
    set({ drift: serverNow - Date.now() });
  },

  // -- products -------------------------------------------------------------
  loadProducts: async () => {
    set({ productsState: "loading", productsError: null });
    try {
      const { data, serverNow } = await api.getProducts(get().userId);
      get().applyDrift(serverNow);
      set({ products: data, productsState: "ready", productsError: null });
      reconcileOffers(get, set, data);
    } catch (err) {
      const message = err instanceof ApiFailure ? err.message : "Failed to load drops.";
      set({ productsState: "error", productsError: message });
    }
  },

  // Background poll: never flips the UI into a full-screen error/loading state.
  pollProducts: async () => {
    try {
      const { data, serverNow } = await api.getProducts(get().userId);
      get().applyDrift(serverNow);
      set({ products: data, productsState: "ready", productsError: null });
      reconcileOffers(get, set, data);
    } catch {
      // Transient poll failure: keep showing last-known-good data silently.
    }
  },

  // -- holds ----------------------------------------------------------------

  // WAIT-FOR-SERVER: stock is contested, so we don't fake success. We show a
  // pending state and only commit the hold once the server confirms it.
  placeHold: async (productId: string, qty = 1) => {
    if (get().pendingHoldFor) return; // one placement at a time
    set({ pendingHoldFor: productId });
    try {
      const { data: hold, serverNow } = await api.placeHold(productId, qty);
      get().applyDrift(serverNow);
      const nextIds = [...get().holdIds, hold.id];
      writeHoldIds(nextIds);
      set((s) => ({
        holdIds: nextIds,
        holds: [...s.holds, hold],
      }));
      get().pushToast("success", `Held ${hold.productName} — 60s to check out.`);
    } catch (err) {
      if (err instanceof ApiFailure) {
        get().applyDrift(err.serverNow);
        const label =
          err.code === "OUT_OF_STOCK"
            ? err.message
            : err.code === "NOT_LIVE"
              ? "That drop isn't live yet."
              : err.code === "TRANSIENT"
                ? "Hold failed — please try again."
                : err.message;
        get().pushToast("error", label);
      } else {
        get().pushToast("error", "Hold failed — please try again.");
      }
    } finally {
      set({ pendingHoldFor: null });
      // Refresh products so the just-changed stock is reflected promptly.
      void get().pollProducts();
    }
  },

  // OPTIMISTIC: release is user-initiated and safe — remove locally first.
  releaseHold: async (id: string) => {
    const prevHolds = get().holds;
    const prevIds = get().holdIds;
    const hold = prevHolds.find((h) => h.id === id);

    const nextIds = prevIds.filter((x) => x !== id);
    const nextHolds = prevHolds.filter((h) => h.id !== id);
    writeHoldIds(nextIds);
    set({ holdIds: nextIds, holds: nextHolds });

    try {
      const { serverNow } = await api.releaseHold(id);
      get().applyDrift(serverNow);
      if (hold) get().pushToast("info", `Released ${hold.productName}.`);
      void get().pollProducts();
    } catch {
      // Roll back on failure so the user doesn't lose a still-valid hold.
      writeHoldIds(prevIds);
      set({ holdIds: prevIds, holds: prevHolds });
      get().pushToast("error", "Couldn't release that hold — try again.");
    }
  },

  // Diff local holdIds against server-alive ids; expired ones get removed +
  // an explained toast. Never let a held item silently vanish.
  refreshHolds: async () => {
    const ids = get().holdIds;
    if (ids.length === 0) {
      if (get().holds.length !== 0) set({ holds: [] });
      return;
    }
    try {
      const { data: alive, serverNow } = await api.refreshHolds(ids);
      get().applyDrift(serverNow);

      const aliveIds = new Set(alive.map((h) => h.id));
      const expired = get().holds.filter((h) => !aliveIds.has(h.id) && ids.includes(h.id));

      for (const h of expired) {
        get().pushToast("expiry", `Hold expired: ${h.productName} returned to the pool.`);
      }

      const nextIds = ids.filter((id) => aliveIds.has(id));
      if (nextIds.length !== ids.length) writeHoldIds(nextIds);
      set({ holds: alive, holdIds: nextIds });
    } catch {
      // Transient refresh failure: leave holds as-is; next tick reconciles.
    }
  },

  // -- second-chance queue --------------------------------------------------

  joinQueue: async (productId: string) => {
    if (get().pendingQueueFor) return;
    set({ pendingQueueFor: productId });
    const name = get().products.find((p) => p.id === productId)?.name ?? "this drop";
    try {
      const { data, serverNow } = await api.joinQueue(productId, get().userId);
      get().applyDrift(serverNow);
      get().pushToast(
        "success",
        `On the waitlist for ${name} — you're #${data.position ?? "?"} of ${data.length}.`,
      );
    } catch (err) {
      const label =
        err instanceof ApiFailure && err.code === "NOT_SOLD_OUT"
          ? "That drop isn't sold out — just hold it."
          : "Couldn't join the waitlist — try again.";
      get().pushToast("error", label);
    } finally {
      set({ pendingQueueFor: null });
      void get().pollProducts();
    }
  },

  leaveQueue: async (productId: string) => {
    if (get().pendingQueueFor) return;
    set({ pendingQueueFor: productId });
    const name = get().products.find((p) => p.id === productId)?.name ?? "this drop";
    try {
      const { serverNow } = await api.leaveQueue(productId, get().userId);
      get().applyDrift(serverNow);
      // Clear any offer-toast de-dupe marker so a future offer re-notifies.
      set((s) => ({
        offeredProductIds: s.offeredProductIds.filter((id) => id !== productId),
      }));
      get().pushToast("info", `Left the waitlist for ${name}.`);
    } catch {
      get().pushToast("error", "Couldn't leave the waitlist — try again.");
    } finally {
      set({ pendingQueueFor: null });
      void get().pollProducts();
    }
  },

  // Claim the exclusive offer → becomes a normal 60s hold (folded into holds).
  claimOffer: async (productId: string) => {
    if (get().pendingQueueFor) return;
    set({ pendingQueueFor: productId });
    try {
      const { data: hold, serverNow } = await api.claimOffer(productId, get().userId);
      get().applyDrift(serverNow);
      const nextIds = [...get().holdIds, hold.id];
      writeHoldIds(nextIds);
      set((s) => ({
        holdIds: nextIds,
        holds: [...s.holds, hold],
        offeredProductIds: s.offeredProductIds.filter((id) => id !== productId),
      }));
      get().pushToast("success", `Claimed ${hold.productName}! 60s to check out.`);
    } catch (err) {
      const label =
        err instanceof ApiFailure && err.code === "NO_OFFER"
          ? "Your reservation window passed — back in the pool."
          : "Claim failed — please try again.";
      get().pushToast("error", label);
    } finally {
      set({ pendingQueueFor: null });
      void get().pollProducts();
    }
  },

  // -- toasts ---------------------------------------------------------------
  pushToast: (kind, message) => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // -- cross-tab ------------------------------------------------------------
  // Another tab changed holdIds in localStorage: re-sync and reconcile.
  syncHoldIdsFromStorage: () => {
    const ids = readHoldIds();
    const cur = get().holdIds;
    const same =
      ids.length === cur.length && ids.every((v, i) => v === cur[i]);
    if (!same) {
      set({ holdIds: ids });
      void get().refreshHolds();
    }
  },
}));
