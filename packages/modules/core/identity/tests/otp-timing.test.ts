import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { createIdentityFacade } from "../src/application/facade";
import { testAuth } from "./helpers/test-auth";

/** Better Auth answers a reset-code request for an unknown address before sending anything, and for a member only after
 *  Postmark answered: the time told whether the address has an account. Both answers now wait for the same floor. */
describe("a reset-code answer takes as long for an address with an account as for one without", () => {
  it("member and unknown address both take at least the floor, and about the same", async () => {
    const ctx = await testAuth();
    try {
      const facade = createIdentityFacade(ctx.auth, ctx.db, { otpAnswerFloorMs: 500 });
      ctx.mailbox.delayMs = 300; // Postmark's round trip, paid only for a member
      const member = `timing-member.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      await ctx.auth.api.signUpEmail({ body: { email: member, password: "first-pass-2026!", name: "" } });
      await ctx.db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE email = ${member}`);
      const unknown = `timing-nobody.${crypto.randomUUID().slice(0, 8)}@test.dev`;

      const timed = async (email: string, path = "/email-otp/send-verification-otp", type = "forget-password") => {
        const started = performance.now();
        const res = await facade.handler(
          new Request(`http://localhost:8000/api/auth${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
            body: JSON.stringify({ email, type }),
          }),
        );
        return { status: res.status, body: await res.json(), ms: performance.now() - started };
      };

      const forNobody = await timed(unknown);
      const forMember = await timed(member);
      expect(forNobody).toMatchObject({ status: 200, body: { success: true } });
      expect(forMember).toMatchObject({ status: 200, body: { success: true } });
      expect(ctx.mailbox.sent.filter((s) => s.purpose === "forget-password").map((s) => s.to)).toEqual([member]);
      expect(forNobody.ms).toBeGreaterThanOrEqual(500);
      expect(forMember.ms).toBeGreaterThanOrEqual(500);
      expect(Math.abs(forNobody.ms - forMember.ms)).toBeLessThan(150);

      // Better Auth's other reset-code route answers the same way.
      const other = await timed(unknown, "/email-otp/request-password-reset");
      expect(other.status).toBe(200);
      expect(other.ms).toBeGreaterThanOrEqual(500);

      // A sign-in code has nothing to hide (it is mailed to any address): no floor.
      ctx.mailbox.delayMs = 0;
      const signIn = await timed(unknown, "/email-otp/send-verification-otp", "sign-in");
      expect(signIn.status).toBe(200);
      expect(signIn.ms).toBeLessThan(400);
    } finally {
      await ctx.close();
    }
  });
});
