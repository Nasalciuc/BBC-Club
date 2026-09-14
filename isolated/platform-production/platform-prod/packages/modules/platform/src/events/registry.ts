import type { ZodTypeAny } from "zod";

export type EventDefinition = {
  /** Latest version of this event type. */
  version: number;
  /** Schema of the LATEST version; the poller validates after upcasting. */
  schema: ZodTypeAny;
  /** upcasters[n] converts a v(n) payload into v(n+1). Must form a continuous chain 1..version-1. */
  upcasters?: Record<number, (payload: any) => any>;
  /** Declared when a type intentionally has no consumer (analytics-only). Checked by a test. */
  noConsumer?: boolean;
};

export type HandlerContext = {
  /** Transaction that also marks the delivery done — handler writes and delivery state commit together. */
  tx: any;
  event: {
    id: string;
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    occurredAt: Date;
  };
  /** system principal acting for the event's member (see authz/principal). */
  principal: { kind: "system"; role: "system"; source: "handler"; actorMemberId?: string };
  logger: {
    info: (o: object, m?: string) => void;
    warn: (o: object, m?: string) => void;
    error: (o: object, m?: string) => void;
  };
  attempt: number;
};
export type Handler = (ctx: HandlerContext, payload: any) => Promise<void>;

export class EventRegistry {
  private defs = new Map<string, EventDefinition>();
  private consumers = new Map<string, Map<string, Handler>>();

  defineEvent(type: string, def: EventDefinition) {
    if (this.defs.has(type)) throw new Error(`event type already defined: ${type}`);
    this.defs.set(type, def);
    return this;
  }

  /** Consumer name = "<module>.on<Event>" and it is the queue key: renaming it replays history for that consumer. */
  registerConsumer(type: string, consumer: string, handler: Handler) {
    if (!this.defs.has(type)) throw new Error(`consumer ${consumer} registered for unknown event ${type}`);
    if (!/^[a-z][a-z-]*\.[a-zA-Z]+$/.test(consumer)) throw new Error(`invalid consumer name: ${consumer}`);
    const m = this.consumers.get(type) ?? new Map<string, Handler>();
    if (m.has(consumer)) throw new Error(`duplicate consumer ${consumer} for ${type}`);
    m.set(consumer, handler);
    this.consumers.set(type, m);
    return this;
  }

  definition(type: string) {
    return this.defs.get(type);
  }
  consumersOf(type: string): string[] {
    return [...(this.consumers.get(type)?.keys() ?? [])];
  }
  handlerFor(type: string, consumer: string) {
    return this.consumers.get(type)?.get(consumer);
  }
  allTypes() {
    return [...this.defs.keys()];
  }
  allConsumers() {
    return [...this.consumers.values()].flatMap((m) => [...m.keys()]);
  }

  /** Upcast a stored payload to the latest version, then validate. Throws on unknown type or broken chain. */
  parse(type: string, version: number, payload: unknown) {
    const def = this.defs.get(type);
    if (!def) throw new Error(`unknown event type: ${type}`);
    let p: any = payload;
    for (let v = version; v < def.version; v++) {
      const up = def.upcasters?.[v];
      if (!up) throw new Error(`missing upcaster ${type} v${v}->v${v + 1}`);
      p = up(p);
    }
    return def.schema.parse(p);
  }
}
