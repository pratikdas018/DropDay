// ============================================================================
// Drop Day — THE SINGLE API BOUNDARY.
// The ONLY file that knows about HTTP/fetch. Components and the store import
// from here and never call fetch directly. Swapping to a real backend =
// change BASE (and nothing else).
// ============================================================================

import type {
  ApiEnvelope,
  ApiError,
  ApiErrorCode,
  Hold,
  Order,
  Product,
  QueueInfo,
} from "./types";

/**
 * Point this at a real backend to swap it out. Empty = same-origin routes,
 * which is what the web app uses.
 *
 * Non-browser consumers (the Expo app) have no same-origin to fall back on, so
 * they call `configureApi({ baseUrl })` once at startup with an absolute URL.
 * The request/response contract is identical either way.
 */
let BASE = "";

export interface ApiConfig {
  /** Absolute origin of the backend, e.g. "https://drop-day.vercel.app". No trailing slash. */
  baseUrl: string;
}

/** Set the API origin. Call once at app startup, before any api.* call. */
export function configureApi(config: ApiConfig): void {
  BASE = config.baseUrl.replace(/\/+$/, "");
}

/** Current API origin ("" = same-origin). */
export function getApiBaseUrl(): string {
  return BASE;
}

export interface ApiResult<T> {
  data: T;
  /** The server's clock at response time — used to compute drift. */
  serverNow: number;
}

/** Typed error thrown by every api.* call on failure. */
export class ApiFailure extends Error {
  code: ApiErrorCode;
  serverNow: number;
  status: number;
  expiredHoldIds?: string[];

  constructor(err: ApiError, status: number) {
    super(err.error);
    this.name = "ApiFailure";
    this.code = err.code;
    this.serverNow = err.serverNow;
    this.status = status;
    this.expiredHoldIds = err.expiredHoldIds;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      // React Native's fetch has no HTTP cache and rejects this option, so only
      // send it where it means something (the browser).
      ...(BASE === "" ? { cache: "no-store" as RequestCache } : {}),
    });
  } catch {
    // Network-level failure: normalize into an ApiFailure the store understands.
    throw new ApiFailure(
      { error: "Network request failed.", code: "TRANSIENT", serverNow: Date.now() },
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiFailure(
      { error: "Malformed server response.", code: "TRANSIENT", serverNow: Date.now() },
      res.status,
    );
  }

  if (!res.ok) {
    const err = body as ApiError;
    throw new ApiFailure(
      {
        error: err?.error ?? "Request failed.",
        code: err?.code ?? "TRANSIENT",
        serverNow: err?.serverNow ?? Date.now(),
        expiredHoldIds: err?.expiredHoldIds,
      },
      res.status,
    );
  }

  const env = body as ApiEnvelope<T>;
  return { data: env.data, serverNow: env.serverNow };
}

export const api = {
  getProducts(userId?: string): Promise<ApiResult<Product[]>> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return request<Product[]>(`/api/products${qs}`, { method: "GET" });
  },

  placeHold(productId: string, qty: number): Promise<ApiResult<Hold>> {
    return request<Hold>("/api/holds", {
      method: "POST",
      body: JSON.stringify({ productId, qty }),
    });
  },

  refreshHolds(ids: string[]): Promise<ApiResult<Hold[]>> {
    if (ids.length === 0) return Promise.resolve({ data: [], serverNow: Date.now() });
    const qs = encodeURIComponent(ids.join(","));
    return request<Hold[]>(`/api/holds?ids=${qs}`, { method: "GET" });
  },

  releaseHold(id: string): Promise<ApiResult<{ released: boolean }>> {
    return request<{ released: boolean }>(`/api/holds/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  checkout(holdIds: string[]): Promise<ApiResult<Order>> {
    return request<Order>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ holdIds }),
    });
  },

  // -- Second-Chance Queue --------------------------------------------------

  joinQueue(productId: string, userId: string): Promise<ApiResult<QueueInfo>> {
    return request<QueueInfo>("/api/queue", {
      method: "POST",
      body: JSON.stringify({ productId, userId }),
    });
  },

  leaveQueue(productId: string, userId: string): Promise<ApiResult<QueueInfo>> {
    return request<QueueInfo>("/api/queue", {
      method: "DELETE",
      body: JSON.stringify({ productId, userId }),
    });
  },

  claimOffer(productId: string, userId: string): Promise<ApiResult<Hold>> {
    return request<Hold>("/api/queue/claim", {
      method: "POST",
      body: JSON.stringify({ productId, userId }),
    });
  },
};
