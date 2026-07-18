// Where the mobile app points the SHARED api layer.
//
// The web app talks to same-origin route handlers; a native app has no origin,
// so it needs an absolute URL. Override without touching code by setting
// EXPO_PUBLIC_API_BASE_URL (Expo inlines EXPO_PUBLIC_* at build time), e.g.
//
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:3000 pnpm --filter @dropday/mobile start
//
// Default: the deployed Vercel backend, so it works out of the box on a phone.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "https://drop-day.vercel.app";
