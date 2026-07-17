"use client";

import Link from "next/link";
import { useStore } from "@/store/useStore";
import { useServerTick } from "@/lib/clock";
import { HoldTimer, PANIC_MS } from "./HoldTimer";
import { EmptyState } from "./States";
import type { Hold } from "@/lib/types";

function HoldRow({ hold }: { hold: Hold }) {
  const nowMs = useServerTick(250);
  const releaseHold = useStore((s) => s.releaseHold);
  const msLeft = hold.expiresAt - nowMs;
  const panic = msLeft > 0 && msLeft <= PANIC_MS;

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border bg-ink/50 p-3 transition ${
        panic ? "border-ember/60 shadow-glow-ember" : "border-edge"
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

export function HoldsPanel() {
  const holds = useStore((s) => s.holds);

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-chalk">
          Your Holds
        </h2>
        <span className="rounded-md border border-edge bg-ink px-2 py-0.5 font-mono text-[11px] text-muted">
          {holds.length}
        </span>
      </div>

      {holds.length === 0 ? (
        <EmptyState
          title="No active holds"
          hint="Hold a live drop and it appears here with a 60-second timer."
        />
      ) : (
        <>
          <ul className="scroll-thin flex max-h-[52vh] flex-col gap-2 overflow-y-auto lg:max-h-[60vh]">
            {holds.map((h) => (
              <HoldRow key={h.id} hold={h} />
            ))}
          </ul>
          <Link
            href="/checkout"
            className="mt-auto block rounded-lg border border-volt/60 bg-volt/10 px-3 py-2.5 text-center font-mono text-sm font-semibold text-volt transition hover:bg-volt/20"
          >
            Checkout ({holds.length})
          </Link>
        </>
      )}
    </div>
  );
}
