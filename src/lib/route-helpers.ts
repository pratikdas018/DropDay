// ============================================================================
// Drop Day — Route Handler helpers.
// Injects realistic edge latency + occasional transient failures, and wraps
// every response in the ApiEnvelope carrying serverNow.
// ============================================================================

import { NextResponse } from "next/server";
import { now } from "./engine";
import type { ApiEnvelope, ApiError, ApiErrorCode } from "./types";

/** Sleep for a random duration in [min, max] ms to simulate network latency. */
export function latency(min: number, max: number): Promise<void> {
  const ms = Math.floor(min + Math.random() * Math.max(0, max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true `rate` of the time (0..1) — used to inject transient failures. */
export function maybeFail(rate: number): boolean {
  return Math.random() < rate;
}

/** Wrap payload in the envelope with a fresh serverNow. */
export function ok<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ data, serverNow: now() }, { status });
}

/** Structured error response, also carrying serverNow. */
export function fail(
  code: ApiErrorCode,
  message: string,
  status = 400,
  extra?: Partial<ApiError>,
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: message, code, serverNow: now(), ...extra },
    { status },
  );
}
