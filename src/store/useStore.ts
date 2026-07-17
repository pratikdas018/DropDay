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

export const useStore = create<StoreState>((set, get) => ({
  products: [],
  productsState: "idle",
  productsError: null,

  holdIds: readHoldIds(),
  holds: [],

  drift: 0,

  toasts: [],

  pendingHoldFor: null,

  // -- time -----------------------------------------------------------------
  serverTime: () => Date.now() + get().drift,

  applyDrift: (serverNow: number) => {
    set({ drift: serverNow - Date.now() });
  },

  // -- products -------------------------------------------------------------
  loadProducts: async () => {
    set({ productsState: "loading", productsError: null });
    try {
      const { data, serverNow } = await api.getProducts();
      get().applyDrift(serverNow);
      set({ products: data, productsState: "ready", productsError: null });
    } catch (err) {
      const message = err instanceof ApiFailure ? err.message : "Failed to load drops.";
      set({ productsState: "error", productsError: message });
    }
  },

  // Background poll: never flips the UI into a full-screen error/loading state.
  pollProducts: async () => {
    try {
      const { data, serverNow } = await api.getProducts();
      get().applyDrift(serverNow);
      set({ products: data, productsState: "ready", productsError: null });
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
