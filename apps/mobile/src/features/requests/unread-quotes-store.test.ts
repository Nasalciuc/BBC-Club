/** The Requests dot's number (unread-quotes-store.ts): the newest question wins whichever answer arrives first, and a
 *  change of member drops every question asked for the member before. */
import { beforeEach, describe, expect, it } from "bun:test";

import {
  askUnreadQuotes,
  noteUnreadQuotes,
  refreshUnreadQuotes,
  resetUnreadQuotes,
  subscribeUnreadQuotes,
  unreadQuotesCount,
} from "./unread-quotes-store";

type Answer = { ok: true; data: { items: { status: string }[] } } | { ok: false };

const quotes = (n: number) => ({
  ok: true as const,
  data: { items: Array.from({ length: n }, () => ({ status: "quoted" })) },
});

/** A server answer that arrives when the test says so. */
function later() {
  let answer!: (a: Answer) => void;
  let asked = 0;
  const promise = new Promise<Answer>((resolve) => {
    answer = resolve;
  });
  return {
    fetchList: () => {
      asked += 1;
      return promise;
    },
    answer,
    asked: () => asked,
  };
}

beforeEach(() => {
  resetUnreadQuotes();
});

describe("the Requests dot's number", () => {
  it("a refresh answered after the Requests screen published a newer list does not put back its number", async () => {
    const slow = later();
    const refresh = refreshUnreadQuotes(slow.fetchList);
    noteUnreadQuotes([{ status: "quoted" }]);
    expect(unreadQuotesCount()).toBe(1);
    slow.answer(quotes(3));
    await refresh;
    expect(unreadQuotesCount()).toBe(1);
  });

  it("the newest question wins: the screen's list asked before a refresh, answered after it, is dropped", async () => {
    const ticket = askUnreadQuotes();
    await refreshUnreadQuotes(async () => quotes(3));
    expect(unreadQuotesCount()).toBe(3);
    noteUnreadQuotes([{ status: "quoted" }], ticket);
    expect(unreadQuotesCount()).toBe(3);
  });

  it("the other way round: an older list shown first, a newer refresh still replaces it", async () => {
    const ticket = askUnreadQuotes();
    const slow = later();
    const refresh = refreshUnreadQuotes(slow.fetchList);
    noteUnreadQuotes([], ticket);
    expect(unreadQuotesCount()).toBe(0);
    slow.answer(quotes(1));
    await refresh;
    expect(unreadQuotesCount()).toBe(1);
  });

  it("a change of member: the number is 0, and every question asked for the member before is dropped", async () => {
    const slow = later();
    noteUnreadQuotes([{ status: "quoted" }, { status: "quoted" }]);
    const refresh = refreshUnreadQuotes(slow.fetchList);
    const ticket = askUnreadQuotes();
    resetUnreadQuotes();
    expect(unreadQuotesCount()).toBe(0);
    slow.answer(quotes(2));
    await refresh;
    noteUnreadQuotes([{ status: "quoted" }], ticket);
    expect(unreadQuotesCount()).toBe(0);
  });

  it("one question at a time while it is newer than the number shown; a new one after a newer list", async () => {
    const slow = later();
    const first = refreshUnreadQuotes(slow.fetchList);
    const again = refreshUnreadQuotes(slow.fetchList);
    expect(again).toBe(first);
    expect(slow.asked()).toBe(1);
    noteUnreadQuotes([]);
    const fresh = later();
    const next = refreshUnreadQuotes(fresh.fetchList);
    expect(next).not.toBe(first);
    expect(fresh.asked()).toBe(1);
    fresh.answer(quotes(2));
    slow.answer(quotes(5));
    await Promise.all([first, next]);
    expect(unreadQuotesCount()).toBe(2);
  });

  it("a failed answer keeps the last number; listeners hear each number published", async () => {
    let heard = 0;
    const unsubscribe = subscribeUnreadQuotes(() => {
      heard += 1;
    });
    noteUnreadQuotes([{ status: "quoted" }, { status: "received" }]);
    await refreshUnreadQuotes(async () => ({ ok: false }));
    expect(unreadQuotesCount()).toBe(1);
    await refreshUnreadQuotes(async () => quotes(4));
    expect(unreadQuotesCount()).toBe(4);
    expect(heard).toBe(2);
    unsubscribe();
    noteUnreadQuotes([]);
    expect(heard).toBe(2);
  });
});
