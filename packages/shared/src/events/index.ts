import { z } from "zod";
import {
  MemberRegisteredV1,
  MemberEmailVerifiedV1,
  MemberPasswordChangedV1,
  MemberDeletedV1,
  MemberLinkedToCrmV1,
  MemberProfileUpdatedV1,
} from "./member";
import { OfferPublishedV1, OfferExpiredV1, OfferWithdrawnV1, OfferViewedV1, OfferRespondedV1 } from "./offer";
import { NotificationDeliveredV1, NotificationFailedV1 } from "./notification";
import { CrmMirrorSyncedV1, CrmActivityCreatedV1 } from "./crm";

type CatalogueEntry = {
  version: number;
  schema: z.ZodTypeAny;
  upcasters?: Record<number, (p: any) => any>;
  noConsumer?: boolean;
  /** Set while the consuming module is not written yet; boot warns instead of failing. Remove when the consumer lands. */
  consumerOwedBy?: "stage-1" | "stage-2" | "stage-3" | "stage-5";
};

/** The single catalogue of event types. `platform` is generic; this is where our domain lives.
 *  The host calls defineEvent for each entry at boot, so an unregistered type cannot be published. */
export const EVENT_CATALOGUE = {
  "member.registered": { version: 1, schema: MemberRegisteredV1 },
  "member.email_verified": { version: 1, schema: MemberEmailVerifiedV1, noConsumer: true },
  "member.password_changed": { version: 1, schema: MemberPasswordChangedV1, noConsumer: true },
  "member.profile_updated": { version: 1, schema: MemberProfileUpdatedV1, consumerOwedBy: "stage-5" },
  "member.linked_to_crm": { version: 1, schema: MemberLinkedToCrmV1, consumerOwedBy: "stage-3" },
  "member.deleted": { version: 1, schema: MemberDeletedV1, consumerOwedBy: "stage-1" },
  "offer.published": { version: 1, schema: OfferPublishedV1, consumerOwedBy: "stage-3" },
  "offer.expired": { version: 1, schema: OfferExpiredV1, consumerOwedBy: "stage-3" },
  "offer.withdrawn": { version: 1, schema: OfferWithdrawnV1, consumerOwedBy: "stage-3" },
  "offer.viewed": { version: 1, schema: OfferViewedV1, noConsumer: true },
  "offer.responded": { version: 1, schema: OfferRespondedV1, consumerOwedBy: "stage-3" },
  "notification.delivered": { version: 1, schema: NotificationDeliveredV1, noConsumer: true },
  "notification.failed": { version: 1, schema: NotificationFailedV1, noConsumer: true },
  "crm.mirror.synced": { version: 1, schema: CrmMirrorSyncedV1, consumerOwedBy: "stage-5" },
  "crm.activity_created": { version: 1, schema: CrmActivityCreatedV1, noConsumer: true },
} as const satisfies Record<string, CatalogueEntry>;

export type EventType = keyof typeof EVENT_CATALOGUE;

/** Payload type derived from the catalogue — the compiler refuses a missing field. */
export type PayloadOf<T extends EventType> = z.infer<(typeof EVENT_CATALOGUE)[T]["schema"]>;

/** Build a payload with `type` and `version` injected from the catalogue. Use this for EVERY publish;
 *  hand-written payloads are how member.linked_to_crm shipped without them. */
export function event<T extends EventType>(type: T, body: Omit<PayloadOf<T>, "type" | "version">): PayloadOf<T> {
  return { type, version: EVENT_CATALOGUE[type].version, ...body } as PayloadOf<T>;
}
export * from "./member";
export * from "./offer";
export * from "./notification";
export * from "./crm";
