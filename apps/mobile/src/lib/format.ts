import type { FlightFactsVM, ProposalCardVM } from "@bbc/shared/api/v1/proposals";

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}H`;
  return `${h}H ${String(m).padStart(2, "0")}`;
}

export function formatValidUntil(iso: string): string {
  try {
    const d = new Date(iso);
    return `Valid until ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } catch {
    return "";
  }
}

export function routeLine(card: Pick<ProposalCardVM, "route" | "cabin">): string {
  return `${card.route.from} → ${card.route.to} · ${card.cabin.toUpperCase()}`;
}

export function factsLine(facts?: FlightFactsVM): string | null {
  if (!facts) return null;
  const parts = [
    facts.nonstop ? "NONSTOP" : "CONNECTING",
    formatDuration(facts.durationMinutes),
    facts.product?.toUpperCase(),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatInboxDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
