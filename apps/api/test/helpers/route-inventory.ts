/** Single source for public /v1 inventory — derived from routeRegistry at boot, not hard-coded lists. */
import { routeRegistry } from "../../src/middleware/authorize";

/** Registry keys like `GET /v1/app-config` that are marked public. */
export function publicGetV1Keys(): string[] {
  return [...routeRegistry.entries()]
    .filter(([k, p]) => p === "public" && k.startsWith("GET /v1"))
    .map(([k]) => k)
    .sort();
}

/** Hono paths (`/v1/...`) for anonymous allow-lists. */
export function publicV1Paths(): string[] {
  return publicGetV1Keys().map((k) => k.replace(/^GET\s+/, ""));
}

/**
 * Policy: the only public GET /v1 routes are app-config and /v1/test/* (dev/Maestro; host must not
 * mount the latter in production).
 */
export function assertPublicGetV1Policy(keys: string[] = publicGetV1Keys()): void {
  for (const key of keys) {
    const path = key.replace(/^GET\s+/, "");
    const ok = path === "/v1/app-config" || path.startsWith("/v1/test/");
    if (!ok) {
      throw new Error(`public GET /v1 route outside policy: ${key}`);
    }
  }
}
