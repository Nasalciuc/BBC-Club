import { describe, it, expect } from "bun:test";
import { reconcileMissingProfiles } from "../../src/handlers/on-member-registered";

describe("reconcileMissingProfiles", () => {
  it("re-emits member.registered only for users without a profile", async () => {
    const published: any[] = [];
    const users = [
      { id: "u1", email: "A@x.com", createdAt: new Date() },
      { id: "u2", email: "b@x.com", createdAt: new Date() },
    ];
    const db = { select: () => ({ from: () => ({ where: async () => [{ id: "u1" }] }) }) }; // u1 has a profile
    const n = await reconcileMissingProfiles({
      db,
      identity: { listUsersCreatedBefore: async () => users },
      publish: async (e) => {
        published.push(e);
      },
    });
    expect(n).toBe(1);
    expect(published[0].payload).toMatchObject({
      type: "member.registered",
      version: 1,
      memberId: "u2",
      emailNormalized: "b@x.com",
    });
  });

  it("does nothing when identity reports no users", async () => {
    const published: any[] = [];
    const n = await reconcileMissingProfiles({
      db: {},
      identity: { listUsersCreatedBefore: async () => [] },
      publish: async (e) => {
        published.push(e);
      },
    });
    expect(n).toBe(0);
    expect(published).toHaveLength(0);
  });
});
