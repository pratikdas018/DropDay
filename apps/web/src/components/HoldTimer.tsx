"use client";

import { fmtCountdown, useServerTick } from "@/lib/clock";
import type { Hold } from "@dropday/shared";

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

  const label = fmtCountdown(msLeft);

  return (
    <span
      className={`font-mono text-sm tabular-nums ${
        panic ? "text-ember motion-safe:animate-pulseRed" : "text-chalk"
      }`}
      aria-live={panic ? "assertive" : "off"}
    >
      <span className={panic ? "inline-block motion-safe:animate-shake" : ""}>
        {/* key on the label so each new second remounts and re-fires the pulse */}
        <span key={label} className="inline-block motion-safe:animate-tickPulse">
          {label}
        </span>
      </span>
    </span>
  );
}

export { PANIC_MS };
