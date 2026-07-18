import { NextRequest } from "next/server";
import { releaseHold } from "@/lib/engine";
import { fail, latency, maybeFail, ok, preflight } from "@/lib/route-helpers";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// DELETE /api/holds/[id] -> release a hold (return stock to the pool)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await latency(120, 340);
  if (maybeFail(0.04)) {
    return fail("TRANSIENT", "Release hiccuped — try again.", 503);
  }

  const released = releaseHold(params.id);
  // Idempotent: releasing an already-gone hold is still a success from the
  // client's point of view (the stock is back either way).
  return ok({ released });
}
