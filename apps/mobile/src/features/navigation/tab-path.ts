/** The paths of the three tabs as the router prints them (the `(tabs)` group is not part of the path). */
const TAB_PATHS = new Set(["/explore", "/requests", "/profile"]);

/** Whether the member is on a tab itself, not on a screen pushed over the tabs. Pure, so it is tested without a router. */
export function isTabPath(pathname: string): boolean {
  return TAB_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}
