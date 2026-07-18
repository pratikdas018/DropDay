"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCountdown, useServerTick } from "@/lib/clock";
import { useStore } from "@/store/useStore";
import { OFFER_DURATION_MS } from "@dropday/shared";
import type { Product } from "@dropday/shared";

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
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)] transition-transform duration-500 ease-out motion-safe:group-hover:translate-x-1/4" />
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

/**
 * The urgent "Claim now" state shown when THIS user holds the active 15s offer.
 * The authoritative deadline lives on the server (offerSecondsLeft, refreshed by
 * polling); we anchor a local deadline and tick it down smoothly between polls.
 */
function OfferPanel({ product }: { product: Product }) {
  const nowMs = useServerTick(250);
  const claimOffer = useStore((s) => s.claimOffer);
  const pendingQueueFor = useStore((s) => s.pendingQueueFor);
  const serverSeconds = product.queue?.offerSecondsLeft ?? 0;

  // Anchor a local deadline; re-anchor whenever the server's value jumps up
  // (fresh offer) so a re-offer on a later queue turn restarts cleanly.
  const deadlineRef = useRef<number>(0);
  const lastServerRef = useRef<number>(0);
  if (serverSeconds > lastServerRef.current) {
    deadlineRef.current = nowMs + serverSeconds * 1000;
  }
  lastServerRef.current = serverSeconds;

  const msLeft = Math.max(0, Math.min(deadlineRef.current - nowMs, OFFER_DURATION_MS));
  const secondsLeft = Math.ceil(msLeft / 1000);
  const claiming = pendingQueueFor === product.id;

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-ember/60 bg-ember/10 p-3 shadow-glow-ember motion-safe:animate-glowPulse">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ember">
          🎟️ Your turn — claim now
        </span>
        <span
          key={secondsLeft}
          className="font-mono text-lg font-bold tabular-nums text-ember motion-safe:animate-tickPulse"
          aria-live="assertive"
        >
          {secondsLeft}s
        </span>
      </div>
      <button
        type="button"
        disabled={claiming || secondsLeft <= 0}
        onClick={() => claimOffer(product.id)}
        className="rounded-lg border border-ember/70 bg-ember/20 px-3 py-2 font-mono text-sm font-semibold text-ember transition hover:bg-ember/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {claiming ? "Claiming…" : "Claim your unit"}
      </button>
    </div>
  );
}

/** Join / leave waitlist controls + position, shown on a sold-out card. */
function WaitlistControls({ product }: { product: Product }) {
  const joinQueue = useStore((s) => s.joinQueue);
  const leaveQueue = useStore((s) => s.leaveQueue);
  const pendingQueueFor = useStore((s) => s.pendingQueueFor);
  const q = product.queue;
  const busy = pendingQueueFor === product.id;
  const queued = q?.queued ?? false;

  return (
    <div className="mt-1 flex flex-col gap-2">
      {queued ? (
        <>
          <div className="flex items-center justify-between font-mono text-[11px] text-muted">
            <span className="text-ice">In line · #{q?.position ?? "?"}</span>
            <span>{q?.length ?? 0} waiting</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => leaveQueue(product.id)}
            className="rounded-lg border border-edge bg-ink px-3 py-2 font-mono text-sm text-muted transition hover:border-muted/60 hover:text-chalk disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Leaving…" : "Leave waitlist"}
          </button>
        </>
      ) : (
        <>
          {(q?.length ?? 0) > 0 && (
            <span className="font-mono text-[11px] text-muted">{q?.length} waiting</span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => joinQueue(product.id)}
            className="rounded-lg border border-ice/50 bg-ice/10 px-3 py-2 font-mono text-sm font-semibold text-ice transition hover:bg-ice/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Joining…" : "Join waitlist"}
          </button>
        </>
      )}
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
      className={`group flex flex-col gap-3 rounded-xl border bg-panel p-4 transition duration-200 ease-out will-change-transform motion-safe:hover:-translate-y-1 hover:border-volt/40 hover:shadow-glow-volt ${
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
            <span
              key={fmtCountdown(msToDrop)}
              className="inline-block motion-safe:animate-tickPulse"
            >
              {fmtCountdown(msToDrop)}
            </span>
          </span>
        </div>
      )}

      {/* An active Second-Chance offer for THIS user takes over the footer with
          an urgent claim state, regardless of the public status. */}
      {product.queue?.hasOffer && <OfferPanel product={product} />}

      {!product.queue?.hasOffer && product.status === "live" && (
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

      {!product.queue?.hasOffer && product.status === "sold_out" && (
        <div className="mt-1 flex flex-col gap-2">
          <span className="font-mono text-sm text-muted">Sold out</span>
          <WaitlistControls product={product} />
        </div>
      )}
    </div>
  );
}
