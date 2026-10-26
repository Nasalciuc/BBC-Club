/** Redaction is at the logger, because call sites forget. ADR-IMPL-042 added the member's note: it reaches the
 *  specialist's e-mail, never a log line — at the top of a log object or two levels down. */
import { expect, test } from "bun:test";
import { Writable } from "node:stream";
import { createLogger } from "../src/telemetry/logger";

test("the member's note, e-mail and phone never reach a log line", () => {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const log = createLogger({ level: "info" }, sink);
  log.info(
    {
      requestId: "r-1",
      note: "Two children, 7 and 10.",
      payload: { note: "nested once", email: "alex@test.dev" },
      a: { b: { note: "nested twice", phone: "+12125550148" } },
    },
    "request send failed",
  );
  const out = lines.join("");
  for (const secret of ["Two children", "nested once", "nested twice", "alex@test.dev", "+12125550148"]) {
    expect(out).not.toContain(secret);
  }
  expect(out).toContain('"requestId":"r-1"');
  expect(out).toContain("[redacted]");
});
