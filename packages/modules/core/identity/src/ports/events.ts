export interface EventPublisher {
  /** Appends to platform.domain_events. Identity hooks do not have Better Auth's transaction,
   *  so they publish post-commit; members reconciles nightly (see MODULE.md). */
  publish(event: {
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId?: string | null;
    payload: unknown;
  }): Promise<void>;
}
