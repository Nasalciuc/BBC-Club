/** The canonical fixture. Every screen, seed and test uses THIS — never invented data. */
export const fixture = {
  member: { id: "00000000-0000-4000-8000-0000000a1e00", email: "alex.morgan@company.com", name: "Alex Morgan", crmClientId: "crm_alex", memberSince: "2024" },
  advisor: { name: "Julia Reed" },
  offers: [
    { key: "london", targeting: "user" as const, title: "Your October in London", from: "JFK", to: "LHR",
      price: 4200, published: 7850, contextLine: "You flew this route in March.", validUntil: "2026-10-04T23:59:59Z",
      facts: { nonstop: true, durationMinutes: 425, product: "Lie-flat suite", carrier: "BA", flightNumber: "BA 178", departLocal: "18:55", arriveLocal: "06:00+1" } },
    { key: "paris", targeting: "broadcast" as const, title: "Autumn in Paris", from: "JFK", to: "CDG",
      price: 3850, published: 6900, validUntil: "2026-10-31T23:59:59Z",
      facts: { nonstop: true, durationMinutes: 440, product: "Lie-flat seat" } },
    { key: "tokyo", targeting: "broadcast" as const, title: "Tokyo before the holidays", from: "JFK", to: "HND",
      price: 4650, published: 8400, validUntil: "2026-11-30T23:59:59Z",
      facts: { nonstop: true, durationMinutes: 840, product: "Lie-flat suite" } },
  ],
  password: "atlantic2026!",
} as const;
