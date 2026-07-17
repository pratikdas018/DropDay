"use client";

// Small, reusable Loading / Error / Empty pieces used across the UI.

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-volt ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = "Loading drops…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-edge bg-panel/60 py-16 text-muted">
      <Spinner className="h-6 w-6" />
      <p className="font-mono text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-ember/40 bg-ember/5 py-16 text-center">
      <p className="max-w-sm px-6 text-chalk">
        <span className="mr-2 font-mono text-ember">✕</span>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-ember/60 bg-ember/10 px-4 py-2 font-mono text-sm text-ember transition hover:bg-ember/20 focus-visible:outline-ember"
      >
        Retry
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge bg-panel/40 py-16 text-center">
      <p className="font-mono text-sm text-chalk">{title}</p>
      {hint ? <p className="max-w-xs px-6 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
