import type { Executor } from "@bbc/db";
import type { requests, requestEvents } from "@bbc/db/schema/requests";

export type RequestRow = typeof requests.$inferSelect;
export type RequestEventRow = typeof requestEvents.$inferSelect;

/** The only import surface of @bbc/requests. module.ts implements it; consumers import it. */
export type RequestsFacade = {
  listForMember(exec: Executor | undefined, memberId: string): Promise<RequestRow[]>;
  get(exec: Executor | undefined, memberId: string, id: string): Promise<RequestRow | undefined>;
};
