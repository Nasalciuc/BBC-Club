/** Structural publish envelope. Owned by shared so ModulePlatform can name it without importing platform. */
export type PublishInput = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  memberId?: string | null;
  /** Validated against the catalogue at publish time; shared cannot name every payload shape. */
  payload: unknown;
  publishedBy: string;
};
