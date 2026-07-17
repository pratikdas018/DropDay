"use client";

import { useStore } from "@/store/useStore";
import type { ToastKind } from "@/store/useStore";

const KIND_STYLES: Record<ToastKind, string> = {
  info: "border-edge bg-panel text-chalk",
  success: "border-volt/50 bg-volt/10 text-volt",
  error: "border-ember/50 bg-ember/10 text-ember",
  expiry: "border-ice/50 bg-ice/10 text-ice",
};

const KIND_ICON: Record<ToastKind, string> = {
  info: "›",
  success: "✓",
  error: "✕",
  expiry: "⏱",
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-slideUp items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${KIND_STYLES[t.kind]}`}
          role="status"
        >
          <span className="mt-0.5 font-mono text-sm" aria-hidden>
            {KIND_ICON[t.kind]}
          </span>
          <p className="flex-1 text-sm leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="font-mono text-xs opacity-60 transition hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
