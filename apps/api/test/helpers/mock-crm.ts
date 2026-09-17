/** The CRM as tests see it: known clients, activities, and submitted requests. */
export function mockCrm(known: { email: string; crmClientId: string; fullName?: string; homeAirport?: string }[] = []) {
  const activities: { externalId: string; memberId: string; offerId: string; kind: string }[] = [];
  const submitted: unknown[] = [];
  let down = false;
  let submitFails = 0;
  return {
    activities,
    submitted,
    setDown: (v: boolean) => {
      down = v;
    },
    setSubmitFails: (n: number) => {
      submitFails = n;
    },
    async findByEmail(emailNormalized: string) {
      const k = known.find((c) => c.email.toLowerCase() === emailNormalized);
      return k ? { crmClientId: k.crmClientId, fullName: k.fullName, homeAirport: k.homeAirport } : null;
    },
    async createActivity(input: {
      externalId: string;
      memberId: string;
      offerId: string;
      kind: "interested" | "dismissed";
    }) {
      if (down) throw new Error("CRM 503");
      if (!activities.some((a) => a.externalId === input.externalId)) activities.push(input);
      return { id: `act_${input.externalId}` };
    },
    async submitRequest(payload: unknown) {
      if (down) throw new Error("CRM 503");
      if (submitFails > 0) {
        submitFails -= 1;
        throw new Error("CRM 503");
      }
      submitted.push(payload);
      return { crmRequestId: `crm_req_${submitted.length}` };
    },
  };
}
