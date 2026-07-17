"use client";

import { fmtCountdown, useServerTick } from "@/lib/clock";
import type { Hold } from "@/lib/types";

const PANIC_MS = 10_000; // final 10 seconds = panic mode

/**
 * Each hold's OWN independent 60s countdown, read from server-adjusted time.
 * Panic mode (final 10s): red, pulses + shakes tastefully. At 0 shows an
 * explicit "Expired" state briefly rather than vanishing — the poll reconciles.
 */
export function HoldTimer({ hold }: { hold: Hold }) {
  const nowMs = useServerTick(250); // finer tick so the last seconds feel live
  const msLeft = hold.expiresAt - nowMs;

  const expired = msLeft <= 0;
  const panic = !expired && msLeft <= PANIC_MS;

  if (expired) {
    return (
      <span className="font-mono text-sm tabular-nums text-ember">Expired</span>
    );
  }

  return (
    <span
      className={`font-mono text-sm tabular-nums ${
        panic ? "text-ember motion-safe:animate-pulseRed" : "text-chalk"
      }`}
      aria-live={panic ? "assertive" : "off"}
    >
      <span className={panic ? "inline-block motion-safe:animate-shake" : ""}>
        {fmtCountdown(msLeft)}
      </span>
    </span>
  );
}

export { PANIC_MS };
