"use client";

import { Header } from "@/components/Header";
import { StoreBootstrap } from "@/components/StoreBootstrap";
import { DropGrid } from "@/components/DropGrid";
import { HoldsPanel } from "@/components/HoldsPanel";
import { Toasts } from "@/components/Toasts";

export default function StorefrontPage() {
  return (
    <>
      <StoreBootstrap />
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-chalk sm:text-3xl">
            Today&apos;s Drops
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Limited stock. Bots are circling. Hold an item to lock it for 60 seconds —
            then check out before the timer runs dry.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Drop grid */}
          <section aria-label="Product drops">
            <DropGrid />
          </section>

          {/* Holds panel: sidebar on desktop, stacked below on mobile */}
          <aside aria-label="Your holds" className="lg:sticky lg:top-20 lg:self-start">
            <HoldsPanel />
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
        <p className="font-mono text-[11px] text-muted">
          Built by Pratik Ch: Das ·{" "}
          <a
            href="https://pratik-web.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 transition hover:text-chalk hover:underline"
          >
            Portfolio
          </a>
        </p>
      </footer>

      <Toasts />
    </>
  );
}
