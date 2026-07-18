"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/**
 * Wires up the lifecycle for the storefront:
 *   • initial products load
 *   • ~2.5s products poll
 *   • ~2s holds refresh
 *   • cross-tab sync via the window `storage` event
 */
export function StoreBootstrap() {
  const loadProducts = useStore((s) => s.loadProducts);
  const pollProducts = useStore((s) => s.pollProducts);
  const refreshHolds = useStore((s) => s.refreshHolds);
  const syncHoldIdsFromStorage = useStore((s) => s.syncHoldIdsFromStorage);

  useEffect(() => {
    // Initial load (full loading/error UX) + immediate holds reconcile.
    void loadProducts();
    void refreshHolds();

    const productsPoll = setInterval(() => void pollProducts(), 2500);
    const holdsPoll = setInterval(() => void refreshHolds(), 2000);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "dropday.holdIds" || e.key === null) {
        syncHoldIdsFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(productsPoll);
      clearInterval(holdsPoll);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadProducts, pollProducts, refreshHolds, syncHoldIdsFromStorage]);

  return null;
}
