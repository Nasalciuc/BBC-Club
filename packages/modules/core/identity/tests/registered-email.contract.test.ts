import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { createIdentityFacade } from "../src/application/facade";
import { testAuth } from "./helpers/test-auth";

describe("registeredEmail — the account members may make a profile row for", () => {
  it("answers the email member.registered carries while the account exists, and null once it is gone", async () => {
    const ctx = await testAuth();
    try {
      const facade = createIdentityFacade(ctx.auth, ctx.db);
      const email = `Erin+${Date.now()}@Test.dev`;
      await ctx.auth.api.signUpEmail({ body: { email, password: "atlantic2026!", name: "" } });
      const [{ id }] = (await ctx.db.execute(sql`SELECT id FROM auth."user" WHERE email = ${email.toLowerCase()}`)) as {
        id: string;
      }[];
      const registered = (await ctx.journal.byType("member.registered")).find((e) => e.payload.memberId === id);

      expect(await facade.registeredEmail(id)).toBe(email.toLowerCase());
      expect(await facade.registeredEmail(id)).toBe(registered?.payload.emailNormalized);
      expect(await facade.registeredEmail(crypto.randomUUID())).toBeNull();

      await ctx.db.execute(sql`DELETE FROM auth."user" WHERE id = ${id}`);
      expect(await facade.registeredEmail(id)).toBeNull();
    } finally {
      await ctx.close();
    }
  });
});
