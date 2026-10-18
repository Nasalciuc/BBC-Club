import { useRouter } from "expo-router";

import { ScreenStatusBar } from "@/components/screen-status-bar";
import { SystemScreen } from "@/components/system-screen";

/**
 * A link the app has no page for — an old one, a mistyped one (ADR-IMPL-047): the page-wide message (Figma 240:5093's
 * layout) in the club's words, instead of Expo's "Unmatched Route" and its sitemap. `Continue` opens the app from its
 * start, which goes on to sign in or to Explore as the session allows.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <ScreenStatusBar on="light" />
      <SystemScreen
        testID="notFound.root"
        title="That page isn’t here."
        body="The link may be out of date."
        primary={{ label: "Continue", testID: "notFound.continue", onPress: () => router.replace("/") }}
      />
    </>
  );
}
