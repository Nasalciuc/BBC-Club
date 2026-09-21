/**
 * Consumer and job shapes owned by shared so ModulePlatform can name them without importing platform.
 * `handler` is a method (bivariant), not a property — so (ctx: JobContext) and (ctx: HandlerContext)
 * assign without casts under strictFunctionTypes.
 */
export type ConsumerSpec = {
  type: string;
  name: string;
  handler(ctx: unknown, payload: unknown): Promise<void>;
};

export type JobSpec = {
  handler(ctx: unknown): Promise<unknown>;
  singleton?: boolean;
  timeoutMs?: number;
  description?: string;
  /** Extra field modules pass; platform ignores unknown keys at runtime. */
  cron?: string;
};
