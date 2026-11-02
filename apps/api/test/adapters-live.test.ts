/** Production must not serve members on the mock CRM or the recording push without saying so (audit, 30 Oct 2026):
 *  /metrics says which adapters are live, and Grafana alerts on production when one is not. */
import { describe, expect, it } from "bun:test";

import { testApp } from "./helpers/test-app";

const gauge = (text: string, name: string) =>
  Number(
    text
      .split("\n")
      .find((l) => l.startsWith(`bbc_${name} `) || l.startsWith(`bbc_${name}{`))
      ?.split(" ")
      .at(-1),
  );

describe("which adapters are live", () => {
  it("/metrics carries crm_live and push_live: 0 for the mock CRM and the recording push", async () => {
    // Set here, not inherited: a shell with CRM_ADAPTER=email would otherwise read 1.
    const t = await testApp({ suite: "adapters-live", env: { CRM_ADAPTER: "mock", PUSH_ADAPTER: "recording" } });
    const text = await (await t.app.request("/metrics")).text();
    expect(gauge(text, "crm_live")).toBe(0);
    expect(gauge(text, "push_live")).toBe(0);
    await t.close();
  });
});
