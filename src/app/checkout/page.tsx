"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StoreBootstrap } from "@/components/StoreBootstrap";
import { HoldTimer } from "@/components/HoldTimer";
import { Toasts } from "@/components/Toasts";
import { EmptyState, Spinner } from "@/components/States";
import { api, ApiFailure } from "@/lib/api";
import { useStore } from "@/store/useStore";
import type { Order } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; order: Order }
  | { kind: "expired"; ids: string[] }
  | { kind: "error"; message: string };

export default function CheckoutPage() {
  const holds = useStore((s) => s.holds);
  const holdIds = useStore((s) => s.holdIds);
  const applyDrift = useStore((s) => s.applyDrift);
  const refreshHolds = useStore((s) => s.refreshHolds);
  const pushToast = useStore((s) => s.pushToast);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const total = useMemo(
    () => holds.reduce((sum, h) => sum + h.price * h.qty, 0),
    [holds],
  );

  async function confirm() {
    if (holdIds.length === 0) return;
    setPhase({ kind: "submitting" });
    try {
      const { data: order, serverNow } = await api.checkout(holdIds);
      applyDrift(serverNow);
      // Order consumed the holds server-side; clear them locally.
      await refreshHolds();
      setPhase({ kind: "success", order });
    } catch (err) {
      if (err instanceof ApiFailure) {
        applyDrift(err.serverNow);
        if (err.code === "HOLD_EXPIRED") {
          // Reconcile the panel so expired holds drop off + toasts fire.
          await refreshHolds();
          setPhase({ kind: "expired", ids: err.expiredHoldIds ?? [] });
          pushToast("expiry", "Some holds expired before checkout — cart updated.");
          return;
        }
        if (err.code === "EMPTY_CART") {
          setPhase({ kind: "error", message: "Your cart is empty." });
          return;
        }
        setPhase({ kind: "error", message: err.message || "Checkout failed — try again." });
        return;
      }
      setPhase({ kind: "error", message: "Checkout failed — try again." });
    }
  }

  // ----- Success screen -----------------------------------------------------
  if (phase.kind === "success") {
    return (
      <>
        <StoreBootstrap />
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          <div className="rounded-xl border border-volt/40 bg-volt/5 p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-volt/50 bg-volt/10 font-mono text-2xl text-volt">
              ✓
            </div>
            <h1 className="font-display text-2xl font-bold text-chalk">You copped it.</h1>
            <p className="mt-1 font-mono text-xs text-muted">
              Order {phase.order.id}
            </p>

            <ul className="mt-6 divide-y divide-edge rounded-lg border border-edge bg-ink/50 text-left">
              {phase.order.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-chalk">
                    {it.productName} <span className="text-muted">×{it.qty}</span>
                  </span>
                  <span className="font-mono text-sm text-chalk">
                    ${(it.price * it.qty).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between px-1">
              <span className="font-mono text-sm text-muted">Total</span>
              <span className="font-mono text-lg text-volt">${phase.order.total}</span>
            </div>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg border border-edge bg-panel px-4 py-2 font-mono text-sm text-chalk transition hover:border-volt/50"
            >
              ← Back to drops
            </Link>
          </div>
        </main>
        <Toasts />
      </>
    );
  }

  // ----- Cart / confirm -----------------------------------------------------
  return (
    <>
      <StoreBootstrap />
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-chalk">Checkout</h1>
          <Link href="/" className="font-mono text-xs text-muted hover:text-chalk">
            ← keep shopping
          </Link>
        </div>

        {phase.kind === "expired" && (
          <div className="mb-4 rounded-lg border border-ember/50 bg-ember/10 p-4">
            <p className="text-sm text-ember">
              <span className="mr-2 font-mono">✕</span>
              {phase.ids.length} hold{phase.ids.length === 1 ? "" : "s"} expired before we
              could complete checkout. Those items went back to the pool. Review your
              remaining holds and try again.
            </p>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="mb-4 rounded-lg border border-ember/50 bg-ember/10 p-4">
            <p className="text-sm text-ember">
              <span className="mr-2 font-mono">✕</span>
              {phase.message}
            </p>
          </div>
        )}

        {holds.length === 0 ? (
          <EmptyState
            title="Nothing to check out"
            hint="Your holds are empty or have expired. Head back and grab a drop."
          />
        ) : (
          <>
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-panel">
              {holds.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="h-10 w-10 shrink-0 rounded-md border border-edge"
                    style={{
                      background: `radial-gradient(120% 120% at 30% 20%, ${h.colorway}f2, ${h.colorway}55 60%, #0A0A0B)`,
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-chalk">{h.productName}</p>
                    <p className="font-mono text-[11px] text-muted">
                      ×{h.qty} · ${h.price}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11px] text-muted">expires in</p>
                    <HoldTimer hold={h} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between px-1">
              <span className="font-mono text-sm text-muted">Total</span>
              <span className="font-mono text-lg text-volt">${total}</span>
            </div>

            <button
              type="button"
              onClick={() => void confirm()}
              disabled={phase.kind === "submitting"}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-volt/60 bg-volt/15 px-4 py-3 font-mono text-sm font-semibold text-volt transition hover:bg-volt/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase.kind === "submitting" ? (
                <>
                  <Spinner /> Confirming…
                </>
              ) : (
                <>Confirm order · ${total}</>
              )}
            </button>
            <p className="mt-2 text-center font-mono text-[11px] text-muted">
              Mock checkout — no payment is taken.
            </p>
          </>
        )}
      </main>
      <Toasts />
    </>
  );
}
