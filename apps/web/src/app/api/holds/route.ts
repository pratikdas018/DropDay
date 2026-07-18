import { NextRequest } from "next/server";
import { listHolds, placeHold } from "@/lib/engine";
import { fail, latency, maybeFail, ok } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

// POST /api/holds  { productId, qty } -> creates a 60s hold (or an error code)
export async function POST(req: NextRequest) {
  await latency(180, 520);
  if (maybeFail(0.06)) {
    return fail("TRANSIENT", "Hold service is under load — try again.", 503);
  }

  let body: { productId?: string; qty?: number };
  try {
    body = await req.json();
  } catch {
    return fail("TRANSIENT", "Invalid request body.", 400);
  }

  const productId = String(body.productId ?? "");
  const qty = Number(body.qty ?? 1);
  if (!productId) {
    return fail("HOLD_NOT_FOUND", "Missing productId.", 400);
  }

  const result = placeHold(productId, qty);
  if (!result.ok) {
    const status = result.code === "HOLD_NOT_FOUND" ? 404 : 409;
    return fail(result.code, result.message, status);
  }
  return ok(result.hold, 201);
}

// GET /api/holds?ids=a,b,c  -> still-alive holds (refresh)
export async function GET(req: NextRequest) {
  await latency(90, 260);
  if (maybeFail(0.04)) {
    return fail("TRANSIENT", "Hold refresh hiccuped — retry.", 503);
  }

  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return ok(listHolds(ids));
}
