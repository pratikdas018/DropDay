"use client";

import { useStore } from "@/store/useStore";
import { ProductCard } from "./ProductCard";
import { EmptyState, ErrorState, LoadingState } from "./States";

export function DropGrid() {
  const products = useStore((s) => s.products);
  const state = useStore((s) => s.productsState);
  const error = useStore((s) => s.productsError);
  const loadProducts = useStore((s) => s.loadProducts);

  if (state === "loading" || state === "idle") {
    return <LoadingState />;
  }

  if (state === "error") {
    return (
      <ErrorState
        message={error ?? "Couldn't load the drops."}
        onRetry={() => void loadProducts()}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="No drops right now"
        hint="Check back soon — new product drops land regularly."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
