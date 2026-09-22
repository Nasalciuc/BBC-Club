/** App-wide session lifecycle signals (no secrets). */

type Listener = () => void;

const revokedListeners = new Set<Listener>();

/** Subscribe to session revocation (HTTP 401 on a non-auth API call). Returns unsubscribe. */
export function onSessionRevoked(listener: Listener): () => void {
  revokedListeners.add(listener);
  return () => {
    revokedListeners.delete(listener);
  };
}

/** Notify subscribers that the session is no longer valid. */
export function emitSessionRevoked(): void {
  for (const listener of revokedListeners) {
    listener();
  }
}
