import { describe, it, expect } from "bun:test";

/** Keep in sync with scripts/check-modules.ts extractConsumerHandlers. */
function extractConsumerHandlers(src: string): string[] {
  const idx = src.search(/consumers:\s*\[/);
  if (idx < 0) return [];
  const arrStart = src.indexOf("[", idx);
  if (arrStart < 0) return [];
  const arr = sliceBalanced(src, arrStart, "[", "]");
  const bodies: string[] = [];
  let searchFrom = 0;
  while (searchFrom < arr.length) {
    const h = arr.indexOf("handler:", searchFrom);
    if (h < 0) break;
    const arrow = arr.indexOf("=>", h);
    if (arrow < 0) break;
    let i = arrow + 2;
    while (arr[i] === " " || arr[i] === "\n" || arr[i] === "\r" || arr[i] === "\t") i += 1;
    if (arr[i] === "{") {
      const body = sliceBalanced(arr, i, "{", "}");
      bodies.push(body);
      searchFrom = i + body.length;
    } else {
      const end = findExpressionEnd(arr, i);
      bodies.push(arr.slice(i, end));
      searchFrom = end;
    }
  }
  return bodies;
}

function sliceBalanced(src: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

function findExpressionEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return i;
      depth -= 1;
    } else if ((c === "," || c === "\n") && depth === 0) return i;
  }
  return src.length;
}

const PORT = /await\s+ports\.(crm|email|push)\./;

describe("check-modules: no integration port in a consumer handler", () => {
  it("fails the old requests.onRequestSubmitted body", () => {
    const src = `
      consumers: [{
        type: "request.submitted",
        handler: async (ctx, raw) => {
          await ports.crm.submitRequest({ phone_valid: true });
        },
      }]
    `;
    expect(extractConsumerHandlers(src).some((b) => PORT.test(b))).toBe(true);
  });

  it("allows a log-only consumer", () => {
    const src = `
      consumers: [{
        handler: async (ctx, raw) => {
          ctx.logger.info({ requestId: "x" }, "request queued for CRM");
        },
      }]
    `;
    expect(extractConsumerHandlers(src).some((b) => PORT.test(b))).toBe(false);
  });
});
