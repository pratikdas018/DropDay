import { NextRequest } from "next/server";
import { claimOffer } from "@/lib/engine";
import { fail, latency, maybeFail, ok } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

// POST /api/queue/claim  { productId, userId }
// Convert an active exclusive offer into a normal 60s hold.
export async function POST(req: NextRequest) {
  await latency(150, 420);
  if (maybeFail(0.05)) {
    return fail("TRANSIENT", "Claim service is under load — try again.", 503);
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

  const result = claimOffer(productId, userId);
  if (!result.ok) {
    const status = result.code === "HOLD_NOT_FOUND" ? 404 : 409;
    return fail(result.code, result.message, status);
  }
  // Return the freshly-minted hold so the client folds it into its holds list.
  return ok(result.hold, 201);
}
