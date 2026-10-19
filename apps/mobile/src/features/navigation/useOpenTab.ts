import { usePathname, useRouter } from "expo-router";

import { TAB_ROUTES, type TabKey } from "./tab-routes";
import { isTabPath } from "./tab-path";

/**
 * Opens a tab from wherever the member is, as the tab bars do: from a tab, the tab bar's own way (`push`, which the
 * tabs navigator turns into a switch); from a screen pushed over the tabs, back down to the tabs already open beneath
 * (`dismissTo`), never a second set of tabs on top.
 */
export function useOpenTab(): (key: TabKey) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (key) => {
    if (isTabPath(pathname)) router.push(TAB_ROUTES[key]);
    else router.dismissTo(TAB_ROUTES[key]);
  };
}
