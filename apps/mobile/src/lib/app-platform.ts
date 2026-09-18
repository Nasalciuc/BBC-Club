/** DB `request_source` is ios|android only. Web and unknown map to ios (same as the API header fallback). */
export function mapAppPlatform(os: string): "ios" | "android" {
  return os === "android" ? "android" : "ios";
}
