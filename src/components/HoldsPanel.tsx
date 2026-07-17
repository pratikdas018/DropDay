"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useServerTick } from "@/lib/clock";
import { HoldTimer, PANIC_MS } from "./HoldTimer";
import { EmptyState } from "./States";
import type { Hold } from "@/lib/types";

const EXIT_MS = 320; // must match the fadeOutHold animation duration

function HoldRow({ hold, exiting }: { hold: Hold; exiting: boolean }) {
  const nowMs = useServerTick(250);
  const releaseHold = useStore((s) => s.releaseHold);
  const msLeft = hold.expiresAt - nowMs;
  const panic = msLeft > 0 && msLeft <= PANIC_MS;

  return (
    <li
      aria-hidden={exiting || undefined}
      className={`flex items-center gap-3 rounded-lg border bg-ink/50 p-3 transition ${
        panic ? "border-ember/60 shadow-glow-ember" : "border-edge"
      } ${
        exiting
          ? "pointer-events-none motion-safe:animate-fadeOutHold"
          : "motion-safe:animate-slideInHold"
      }`}
    >
      <div
        className="h-10 w-10 shrink-0 rounded-md border border-edge"
        style={{
          background: `radial-gradient(120% 120% at 30% 20%, ${hold.colorway}f2, ${hold.colorway}55 60%, #0A0A0B)`,
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-chalk">{hold.productName}</p>
        <p className="font-mono text-[11px] text-muted">
          ×{hold.qty} · ${hold.price}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <HoldTimer hold={hold} />
        <button
          type="button"
          onClick={() => void releaseHold(hold.id)}
          className="font-mono text-[11px] text-muted underline-offset-2 transition hover:text-chalk hover:underline"
        >
          Release
        </button>
      </div>
    </li>
  );
}

/**
 * Presence layer over the store's `holds`, purely for exit animations.
 * The store stays the source of truth — this hook never mutates it. When a hold
 * disappears from the store (released or expired) we keep a snapshot of that row
 * mounted for EXIT_MS so it can fade out, then drop it. New holds are appended
 * in store order and slide in on mount.
 */
function useHoldPresence(holds: Hold[]) {
  // Rendered rows = live holds + any lingering "exiting" snapshots.
  const [exiting, setExiting] = useState<Hold[]>([]);
  const prevRef = useRef<Hold[]>(holds);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const liveIds = new Set(holds.map((h) => h.id));
    const removed = prevRef.current.filter((h) => !liveIds.has(h.id));

    if (removed.length > 0) {
      setExiting((cur) => {
        const known = new Set(cur.map((h) => h.id));
        return [...cur, ...removed.filter((h) => !known.has(h.id))];
      });
      for (const h of removed) {
        if (timersRef.current.has(h.id)) continue;
        const t = setTimeout(() => {
          setExiting((cur) => cur.filter((x) => x.id !== h.id));
          timersRef.current.delete(h.id);
        }, EXIT_MS);
        timersRef.current.set(h.id, t);
      }
    }

    // If a hold reappears (e.g. cross-tab re-sync), cancel its pending exit.
    if (exiting.length > 0) {
      const stillExiting = exiting.filter((h) => !liveIds.has(h.id));
      if (stillExiting.length !== exiting.length) {
        for (const h of exiting) {
          if (liveIds.has(h.id) && timersRef.current.has(h.id)) {
            clearTimeout(timersRef.current.get(h.id)!);
            timersRef.current.delete(h.id);
          }
        }
        setExiting(stillExiting);
      }
    }

    prevRef.current = holds;
  }, [holds, exiting]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const liveIds = new Set(holds.map((h) => h.id));
  const lingering = exiting.filter((h) => !liveIds.has(h.id));
  return { live: holds, lingering };
}

export function HoldsPanel() {
  const holds = useStore((s) => s.holds);
  const { live, lingering } = useHoldPresence(holds);

  const hasRows = live.length + lingering.length > 0;

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-chalk">
          Your Holds
        </h2>
        <span className="rounded-md border border-edge bg-ink px-2 py-0.5 font-mono text-[11px] text-muted">
          {live.length}
        </span>
      </div>

      {!hasRows ? (
        <EmptyState
          title="No active holds"
          hint="Hold a live drop and it appears here with a 60-second timer."
        />
      ) : (
        <>
          <ul className="scroll-thin flex max-h-[52vh] flex-col gap-2 overflow-y-auto lg:max-h-[60vh]">
            {live.map((h) => (
              <HoldRow key={h.id} hold={h} exiting={false} />
            ))}
            {lingering.map((h) => (
              <HoldRow key={h.id} hold={h} exiting />
            ))}
          </ul>
          <Link
            href="/checkout"
            aria-disabled={live.length === 0 || undefined}
            className={`mt-auto block rounded-lg border border-volt/60 bg-volt/10 px-3 py-2.5 text-center font-mono text-sm font-semibold text-volt transition hover:bg-volt/20 ${
              live.length === 0 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Checkout ({live.length})
          </Link>
        </>
      )}
    </div>
  );
}
