// ============================================================================
// @dropday/shared — the public surface of the shared package.
//
// Two genuinely reused concerns live here:
//   • types.ts — THE CONTRACT shared by the server engine, the route handlers,
//     the API boundary, the store, and the UI.
//   • api.ts   — THE SINGLE API BOUNDARY (the only place that touches fetch).
//
// Consumers import from "@dropday/shared", never from deep paths.
// ============================================================================

export * from "./types";
export * from "./api";
