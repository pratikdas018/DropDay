// ============================================================================
// Drop Day — clock utilities.
// Countdowns must read SERVER-ADJUSTED time (Date.now() + drift), never raw
// Date.now(). The API is the source of truth for time.
// ============================================================================

"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";

/**
 * Re-renders on an interval and returns the current SERVER time
 * (Date.now() + drift). Use this for anything that ticks.
 */
export function useServerTick(ms = 1000): number {
  const drift = useStore((s) => s.drift);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);

  return Date.now() + drift;
}

/** Format remaining ms as "M:SS" (clamped at 0:00). */
export function fmtCountdown(msLeft: number): string {
  const clamped = Math.max(0, msLeft);
  const totalSec = Math.ceil(clamped / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
