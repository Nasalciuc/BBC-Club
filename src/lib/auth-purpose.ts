export type AuthPurpose = "join" | "reset";

/** ADR-PROD-001: missing or unknown purpose is join, never inferred from navigation. */
export function parseAuthPurpose(value?: string | string[]): AuthPurpose {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "reset" ? "reset" : "join";
}
