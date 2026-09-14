import { describe, it, expect } from "bun:test";
import { testAuth } from "./helpers/test-auth";

describe("breached passwords are refused in the club's voice", () => {
  it("rejects password123", async () => {
    const ctx = await testAuth({ hibp: (p) => p === "password123" });
    await expect(
      ctx.auth.api.signUpEmail({ body: { email: `p+${Date.now()}@test.dev`, password: "password123", name: "" } }),
    ).rejects.toMatchObject({ body: { message: expect.stringContaining("data breach") } });
  });
});
