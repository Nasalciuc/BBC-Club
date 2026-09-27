import { describe, expect, it } from "bun:test";
import { postmarkSender } from "../src/postmark";

describe("sendOperatorRequest", () => {
  it("posts To, ReplyTo, subject, and the text body", async () => {
    let seen: { url: string; body: Record<string, string> } | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) as Record<string, string> };
      return new Response("{}", { status: 200 });
    };
    await postmarkSender({ token: "server-token", from: "club@buybusinessclass.com", fetchImpl }).sendOperatorRequest({
      to: "ops@buybusinessclass.com",
      subject: "Request R-1 · JFK→LHR · Business Class",
      text: "New fare request R-1",
      replyTo: "alex@test.dev",
    });
    expect(seen?.body.To).toBe("ops@buybusinessclass.com");
    expect(seen?.body.ReplyTo).toBe("alex@test.dev");
    expect(seen?.body.Subject).toContain("R-1");
    expect(seen?.body.TextBody).toContain("New fare request R-1");
    expect(seen?.body.MessageStream).toBe("outbound");
  });
});
