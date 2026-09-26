import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/index";
import { renderCrontab } from "../src/cron/render";

const CRONTAB = fileURLToPath(new URL("../../../infra/cron/crontab", import.meta.url));
const { platform, shutdown } = await buildApp({ startPoller: false });
const want = renderCrontab(platform.jobs.schedule());
await shutdown();

if (process.argv.includes("--check")) {
  if (readFileSync(CRONTAB, "utf8") !== want) {
    console.error("infra/cron/crontab is stale — run `bun run cron:gen`");
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(CRONTAB, want);
console.log(`crontab: ${platform.jobs.schedule().length} jobs`);
