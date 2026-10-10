import { systemPathFor } from "@/lib/deeplink-logic";

/**
 * Expo Router's hook for every URL that opens the app (ADR-IMPL-041, A2c). The club's own links
 * (`bbcclub://requests/<id>`, `bbcclub://inbox`, …) are routed by the root layout once a session is known
 * (`lib/deeplinks.ts`); here they return null, so Expo Router does not also route them — `requests/<id>` matches no
 * screen file (the detail is `request/[id]`) and would open "Unmatched Route" beneath it. Any other path is unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return systemPathFor(path);
}
