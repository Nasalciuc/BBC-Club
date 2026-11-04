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
    expect(GUIDES_URL).toBe("https://buybusinessclass.com/blog");
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
