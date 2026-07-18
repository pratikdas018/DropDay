import { NextRequest } from "next/server";
import { joinQueue, leaveQueue } from "@/lib/engine";
import { fail, latency, maybeFail, ok } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

// POST /api/queue  { productId, userId } -> join the Second-Chance waitlist
export async function POST(req: NextRequest) {
  await latency(120, 340);
  if (maybeFail(0.05)) {
    return fail("TRANSIENT", "Waitlist service hiccuped — retry.", 503);
  }

  let body: { productId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Invalid request body.", 400);
  }

  const productId = String(body.productId ?? "");
  const userId = String(body.userId ?? "");
  if (!productId) return fail("HOLD_NOT_FOUND", "Missing productId.", 400);
  if (!userId) return fail("BAD_REQUEST", "Missing userId.", 400);

  const result = joinQueue(productId, userId);
  if (!result.ok) {
    const status =
      result.code === "HOLD_NOT_FOUND" ? 404 : result.code === "NOT_SOLD_OUT" ? 409 : 400;
    return fail(result.code, result.message, status);
  }
  return ok(result.queue, 201);
}

// DELETE /api/queue  { productId, userId } -> leave the waitlist
export async function DELETE(req: NextRequest) {
  await latency(100, 300);
  if (maybeFail(0.04)) {
    return fail("TRANSIENT", "Waitlist update hiccuped — retry.", 503);
  }

  let body: { productId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Invalid request body.", 400);
  }

  const productId = String(body.productId ?? "");
  const userId = String(body.userId ?? "");
  if (!productId) return fail("HOLD_NOT_FOUND", "Missing productId.", 400);
  if (!userId) return fail("BAD_REQUEST", "Missing userId.", 400);

  const result = leaveQueue(productId, userId);
  if (!result.ok) {
    const status = result.code === "HOLD_NOT_FOUND" ? 404 : 400;
    return fail(result.code, result.message, status);
  }
  return ok(result.queue);
}
