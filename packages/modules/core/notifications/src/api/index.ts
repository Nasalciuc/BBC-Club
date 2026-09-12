/** The only import surface of @bbc/notifications. Other modules and the host see nothing else. */
export type NotificationsFacade = ReturnType<typeof createNotificationsFacade>;
export function createNotificationsFacade(_deps: { db: unknown }) {
  return {};
}
