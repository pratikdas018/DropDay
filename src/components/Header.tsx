"use client";

import Link from "next/link";
import { useStore } from "@/store/useStore";

export function Header() {
  const holdCount = useStore((s) => s.holds.length);

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-chalk">
            DROP<span className="text-volt">DAY</span>
          </span>
          <span className="hidden font-mono text-[11px] text-muted sm:inline">
            /limited-stock drops
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 font-mono text-[11px] text-muted sm:flex">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-volt" />
            live engine
          </span>
          <Link
            href="/checkout"
            className="rounded-lg border border-edge bg-panel px-3 py-1.5 font-mono text-xs text-chalk transition hover:border-volt/50"
          >
            Holds
            {holdCount > 0 && (
              <span className="ml-1.5 rounded bg-volt px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                {holdCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
