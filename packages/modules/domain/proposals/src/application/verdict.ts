import type { OfferRow, OfferVerdict } from "../api";

/** The offer read with what `offersRepo.withVerdict` asks of it, or null for no such offer. */
type Read = { offer: OfferRow; visible: boolean; meant: boolean; lapsed: boolean } | null;

/** ADR-IMPL-075: what an offer is to a member — the rule, once (OfferVerdict). */
export function toVerdict(r: Read): OfferVerdict {
  if (!r) return { kind: "missing" };
  if (r.visible) return { kind: "visible", offer: r.offer };
  const { status } = r.offer;
  const gone = status === "withdrawn" || status === "expired" || (status === "active" && r.lapsed);
  return gone && r.meant ? { kind: "gone", offer: r.offer } : { kind: "not_yours" };
}
