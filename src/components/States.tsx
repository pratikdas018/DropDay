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

/**
 * A single reusable shimmer block. The shimmer sweep is motion-safe; when the
 * user prefers reduced motion it degrades to a static muted placeholder.
 */
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-edge/60 ${className}`}>
      <div className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(237,237,240,0.08),transparent)] motion-safe:animate-shimmer" />
    </div>
  );
}

/** Skeleton placeholder that mirrors the ProductCard layout. */
function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-panel p-4">
      <Shimmer className="h-36 w-full rounded-lg" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-3/4" />
          <Shimmer className="h-3 w-full" />
        </div>
        <Shimmer className="h-4 w-10 shrink-0" />
      </div>
      <Shimmer className="h-3 w-1/3" />
      <div className="mt-1 space-y-2">
        <div className="flex items-center justify-between">
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-3 w-8" />
        </div>
        <Shimmer className="h-1.5 w-full rounded-full" />
        <Shimmer className="mt-1 h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Loading grid: skeleton cards matching the real DropGrid layout. */
export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading drops"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
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
