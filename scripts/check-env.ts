/**
 * Would the server boot on this environment? The same rules it applies at boot (loadEnv), run on their own: exit 0 with
 * a one-line summary (and a line naming any setting left as the example's comment), or exit 1 naming what is wrong.
 * bootstrap.sh and deploy.sh run it inside the new image, once for each service, before anything starts. It prints
 * setting names and rules, never a value.
 *
 *   docker compose … run --rm --no-deps api bun scripts/check-env.ts
 */
import { isTemplateComment, loadEnv, ServerEnv } from "@bbc/shared/env";

export type EnvCheck = { ok: true; summary: string; warning?: string } | { ok: false; reason: string };

export function checkEnv(source: NodeJS.ProcessEnv): EnvCheck {
  try {
    const env = loadEnv(source);
    const push = env.PUSH_ADAPTER !== "live" ? "recording" : env.APNS_P8_BASE64 ? "live" : "live on Android only";
    const summary = `NODE_ENV ${env.NODE_ENV}, APP_ROLE ${env.APP_ROLE}, CRM ${env.CRM_ADAPTER}, push ${push}`;
    // loadEnv refuses a secret left as the example's comment; any other setting left that way boots, wrong: say so.
    const commented = Object.keys(ServerEnv.shape).filter((key) => isTemplateComment(source[key]));
    if (commented.length === 0) return { ok: true, summary };
    return {
      ok: true,
      summary,
      warning: `${commented.join(", ")}: the example file's comment, not a value ("KEY=   # …" keeps the comment) — fill in, or leave nothing after "="`,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

if (import.meta.main) {
  const result = checkEnv(process.env);
  if (result.ok) {
    console.log(`env ok: ${result.summary}`);
    if (result.warning) console.log(`⚠ ${result.warning}`);
  } else {
    console.error(`env refused: ${result.reason}`);
    process.exit(1);
  }
}
