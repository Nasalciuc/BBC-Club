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
      return {
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: null,
        caption: null,
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
      return {
        badge: "booked",
        showTimeline: true,
        timelineStatus: status,
        sentence: null,
        caption: null,
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

function closedLine(at?: string | null): string {
  if (!at) return "Closed";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "Closed";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Closed · ${date}`;
}
