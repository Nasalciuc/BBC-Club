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

/** Five cron fields, or "manual" for a job that only runs when someone calls it. */
export type JobSchedule = string;
export const CRON_FIELDS_RE = /^\S+(\s+\S+){4}$/;

export type JobSpec = {
  handler(ctx: unknown): Promise<unknown>;
  /** REQUIRED (ADR-IMPL-021). `bun run cron:gen` writes infra/cron/crontab from this field. */
  cron: JobSchedule;
  singleton?: boolean;
  timeoutMs?: number;
  description?: string;
};
