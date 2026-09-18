import { describe, it, expect } from "bun:test";
import { principalFromJwtPayload } from "../src/middleware/principal";

describe("principalFromJwtPayload", () => {
  it("rejects an operator JWT without email", () => {
    const r = principalFromJwtPayload({ role: "operator", sub: "op-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects an operator JWT with empty email", () => {
    const r = principalFromJwtPayload({ role: "operator", sub: "op-1", email: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("accepts an operator JWT with email", () => {
    const r = principalFromJwtPayload({ role: "operator", sub: "op-1", email: "ops@test.dev" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.principal.kind).toBe("operator");
      if (r.principal.kind === "operator") expect(r.principal.email).toBe("ops@test.dev");
    }
  });

  it("maps system role", () => {
    const r = principalFromJwtPayload({ role: "system", sub: "svc" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.principal.kind).toBe("system");
  });

  it("forbids an unknown role", () => {
    const r = principalFromJwtPayload({ role: "member", sub: "m1", email: "a@b.c" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});
