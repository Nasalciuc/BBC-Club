/** One mapping for the requests list and the detail screen. */

export type RequestBadge = "received" | "quote_ready" | "booked" | "not_sent";

export type RequestView = {
  badge: RequestBadge | null;
  showTimeline: boolean;
  /** Status handed to Timeline. `queued` keeps every step hollow. */
  timelineStatus: string;
  sentence: string | null;
  /** Current-step caption the frames actually show. Null when the frame has none. */
  caption: string | null;
  closedLine: string | null;
};

const NOT_SENT = "Saved on your phone. It goes out when you're back online.";

/** Closed event time when the list or detail payload has one; otherwise the request's createdAt. */
export function closedAt(r: { createdAt: string; timeline: readonly { status: string; at: string }[] }): string {
  return r.timeline.find((e) => e.status === "closed")?.at ?? r.createdAt;
}

export function requestView(status: string, at?: string | null): RequestView {
  switch (status) {
    case "received":
      // Figma 233:4248 (P5 / Request detail · received).
      return {
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: "We have your request. A specialist will call shortly to discuss your flight.",
        caption: "We have your travel details.",
        closedLine: null,
      };
    case "assigned":
      return {
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: "A specialist is reviewing your request.",
        caption: "A specialist will call you shortly.",
        closedLine: null,
      };
    case "quoted":
      return {
        badge: "quote_ready",
        showTimeline: true,
        timelineStatus: status,
        sentence: "Your quote is ready. A specialist will call shortly to confirm the details.",
        caption: "Review the quote with your specialist.",
        closedLine: null,
      };
    case "booked":
      // Figma 233:4388 (P5 / Request detail · booked).
      return {
        badge: "booked",
        showTimeline: true,
        timelineStatus: status,
        sentence: "Your specialist completed this booking by phone. Your itinerary was sent by email.",
        caption: "Your specialist confirms your flights.",
        closedLine: null,
      };
    case "closed":
      return {
        badge: null,
        showTimeline: false,
        timelineStatus: status,
        sentence: "This request is closed.",
        caption: null,
        closedLine: closedLine(at),
      };
    case "not_sent":
    case "queued":
      return {
        badge: "not_sent",
        showTimeline: true,
        timelineStatus: "queued",
        sentence: NOT_SENT,
        caption: null,
        closedLine: null,
      };
    default:
      return {
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: null,
        caption: null,
        closedLine: null,
      };
  }
}

/**
 * The line under the in-progress list (Figma 233:4639 · Just received, 240:5199 · Not sent). One request that was just
 * received is reassured; anything not sent is pointed at. Nothing otherwise.
 */
export function listHints(open: readonly { status: string }[]): string[] {
  const notSent = open.filter((r) => r.status === "not_sent" || r.status === "queued").length;
  if (notSent > 0) {
    return [
      notSent === 1 ? "One request needs your attention." : `${notSent} requests need your attention.`,
      "Open your request to check the details and try again.",
    ];
  }
  if (open.length === 1 && open[0]?.status === "received") {
    return ["Your request is with us. A specialist will call shortly."];
  }
  return [];
}

function closedLine(at?: string | null): string {
  if (!at) return "Closed";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "Closed";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Closed · ${date}`;
}
