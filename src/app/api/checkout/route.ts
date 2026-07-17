import { NextRequest } from "next/server";
import { checkout } from "@/lib/engine";
import { fail, latency, maybeFail, ok } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

// POST /api/checkout  { holdIds } -> order, or HOLD_EXPIRED with the bad ids
export async function POST(req: NextRequest) {
  await latency(250, 650);
  if (maybeFail(0.05)) {
    return fail("TRANSIENT", "Checkout is busy — try again.", 503);
  }

  let body: { holdIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("TRANSIENT", "Invalid request body.", 400);
  }

  const holdIds = Array.isArray(body.holdIds)
    ? body.holdIds.map((x) => String(x)).filter(Boolean)
    : [];

  const result = checkout(holdIds);
  if (!result.ok) {
    if (result.code === "EMPTY_CART") {
      return fail("EMPTY_CART", result.message, 400);
    }
    return fail("HOLD_EXPIRED", result.message, 409, {
      expiredHoldIds: result.expiredHoldIds,
    });
  }
  return ok(result.order, 201);
}
