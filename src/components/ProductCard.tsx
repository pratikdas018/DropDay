"use client";

import { fmtCountdown, useServerTick } from "@/lib/clock";
import { useStore } from "@/store/useStore";
import type { Product } from "@/lib/types";

const HYPE_THRESHOLD = 300; // watchers above this = "Hyped"

function Swatch({ colorway, hyped }: { colorway: string; hyped: boolean }) {
  return (
    <div
      className={`relative h-36 w-full overflow-hidden rounded-lg border border-edge ${
        hyped ? "shadow-glow-ember" : ""
      }`}
      style={{
        background: `radial-gradient(120% 120% at 20% 10%, ${colorway}f2 0%, ${colorway}66 35%, #0A0A0B 100%)`,
      }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)]" />
    </div>
  );
}

function StockBar({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;
  const low = available <= 2;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          low ? "bg-ember" : "bg-volt"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const nowMs = useServerTick(1000);
  const placeHold = useStore((s) => s.placeHold);
  const pendingHoldFor = useStore((s) => s.pendingHoldFor);

  const isPending = pendingHoldFor === product.id;
  const anyPending = pendingHoldFor !== null;
  const hyped = product.watchers >= HYPE_THRESHOLD;

  const msToDrop = product.dropsAt - nowMs;
  const low = product.status === "live" && product.available <= 2 && product.available > 0;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-panel p-4 transition ${
        hyped ? "border-ember/40 animate-glowPulse" : "border-edge"
      }`}
    >
      <div className="relative">
        <Swatch colorway={product.colorway} hyped={hyped} />
        {/* Status pill */}
        <div className="absolute left-2 top-2 flex items-center gap-1">
          {product.status === "live" && (
            <span className="rounded-md border border-volt/40 bg-ink/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-volt">
              ● Live
            </span>
          )}
          {product.status === "dropping_soon" && (
            <span className="rounded-md border border-ice/40 bg-ink/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ice">
              Dropping
            </span>
          )}
          {product.status === "sold_out" && (
            <span className="rounded-md border border-edge bg-ink/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              Sold out
            </span>
          )}
        </div>
        {hyped && (
          <span className="absolute right-2 top-2 rounded-md border border-ember/50 bg-ink/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ember">
            🔥 Hyped
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold leading-tight text-chalk">
            {product.name}
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">{product.blurb}</p>
        </div>
        <span className="shrink-0 font-mono text-sm text-chalk">${product.price}</span>
      </div>

      {/* Watchers / hype meter */}
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <span className={hyped ? "text-ember" : "text-muted"}>👁</span>
        <span className={hyped ? "text-ember" : "text-muted"}>
          {product.watchers.toLocaleString()} watching
        </span>
      </div>

      {/* State-specific footer */}
      {product.status === "dropping_soon" && (
        <div className="mt-1 flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ice">
            Drops in
          </span>
          <span className="font-mono text-2xl tabular-nums text-ice">
            {fmtCountdown(msToDrop)}
          </span>
        </div>
      )}

      {product.status === "live" && (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              className={`font-mono text-sm tabular-nums ${
                low ? "text-ember" : "text-chalk"
              }`}
            >
              {low ? `Only ${product.available} left` : `${product.available} in stock`}
            </span>
            <span className="font-mono text-[11px] text-muted">/ {product.totalStock}</span>
          </div>
          <StockBar available={product.available} total={product.totalStock} />
          <button
            type="button"
            disabled={anyPending || product.available <= 0}
            onClick={() => placeHold(product.id, 1)}
            className="mt-1 rounded-lg border border-volt/60 bg-volt/10 px-3 py-2 font-mono text-sm font-semibold text-volt transition hover:bg-volt/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Holding…" : "Hold for 60s"}
          </button>
        </div>
      )}

      {product.status === "sold_out" && (
        <div className="mt-1 flex flex-col gap-2">
          <span className="font-mono text-sm text-muted">Sold out</span>
          <button
            type="button"
            disabled
            className="mt-1 cursor-not-allowed rounded-lg border border-edge bg-ink px-3 py-2 font-mono text-sm text-muted opacity-60"
          >
            Unavailable
          </button>
        </div>
      )}
    </div>
  );
}
