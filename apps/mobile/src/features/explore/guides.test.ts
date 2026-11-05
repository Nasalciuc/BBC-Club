import { describe, expect, it } from "bun:test";

import { GUIDES_URL, openGuides } from "./guides";

describe("openGuides", () => {
  it("opens the site's blog in the app's browser", async () => {
    const opened: string[] = [];
    await openGuides(
      async (url) => opened.push(`in:${url}`),
      async (url) => opened.push(`out:${url}`),
    );
    expect(opened).toEqual([`in:${GUIDES_URL}`]);
  });

  it("asks for the site's app mode and names the app, and nothing about the member", () => {
    const url = new URL(GUIDES_URL);
    expect(`${url.origin}${url.pathname}`).toBe("https://buybusinessclass.com/blog");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app: "1",
      utm_source: "bbcclub_app",
      utm_medium: "app",
    });
  });

  it("falls back to the phone's browser when the app's cannot open", async () => {
    const opened: string[] = [];
    await openGuides(
      async () => {
        throw new Error("no browser");
      },
      async (url) => opened.push(`out:${url}`),
    );
    expect(opened).toEqual([`out:${GUIDES_URL}`]);
  });

  it("leaves a failure of both to the caller", async () => {
    const fail = async () => {
      throw new Error("nothing opens");
    };
    await expect(openGuides(fail, fail)).rejects.toThrow("nothing opens");
  });
});
