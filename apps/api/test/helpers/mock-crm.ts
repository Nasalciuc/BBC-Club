/** The CRM as tests see it: a map of known clients and a list of activities written. */
export function mockCrm(known: { email: string; crmClientId: string; fullName?: string; homeAirport?: string }[] = []) {
  const activities: { externalId: string; memberId: string; offerId: string; kind: string }[] = [];
  let down = false;
  return {
    activities,
    setDown: (v: boolean) => { down = v; },
    async findByEmail(emailNormalized: string) {
      const k = known.find((c) => c.email.toLowerCase() === emailNormalized);
      return k ? { crmClientId: k.crmClientId, fullName: k.fullName, homeAirport: k.homeAirport } : null;
    },
    async createActivity(input: { externalId: string; memberId: string; offerId: string; kind: "interested" | "dismissed" }) {
      if (down) throw new Error("CRM 503");
      if (!activities.some((a) => a.externalId === input.externalId)) activities.push(input);   // idempotent like the real one must be
      return { id: `act_${input.externalId}` };
    },
  };
}
