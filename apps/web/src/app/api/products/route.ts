import { NextRequest } from "next/server";
import { listProducts } from "@/lib/engine";
import { fail, latency, maybeFail, ok, preflight } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// GET /api/products?userId=xyz
// userId is optional; when present each product carries that user's queue info.
export async function GET(req: NextRequest) {
  await latency(120, 380);
  if (maybeFail(0.05)) {
    return fail("TRANSIENT", "Products feed hiccuped — retry.", 503);
  }
  const userId = req.nextUrl.searchParams.get("userId")?.trim() || undefined;
  return ok(listProducts(userId));
}
