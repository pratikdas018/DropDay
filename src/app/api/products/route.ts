import { listProducts } from "@/lib/engine";
import { fail, latency, maybeFail, ok } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  await latency(120, 380);
  if (maybeFail(0.05)) {
    return fail("TRANSIENT", "Products feed hiccuped — retry.", 503);
  }
  return ok(listProducts());
}
