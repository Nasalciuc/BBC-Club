import { useRouter } from "expo-router";
import { useState } from "react";

import { signOut } from "@/features/auth/flows";
import { stateCopy } from "@/lib/error-context";

/**
 * `Sign out` (12, 34): the local session cleared, then the entry's Sign in. When the session could not be cleared the
 * button comes back and the page says so — the member is never left signed in while the app says otherwise.
 */
export function useSignOut(): { signingOut: boolean; failure: string | null; signOutNow: () => void } {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setSigningOut(true);
    setFailure(null);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
      setFailure(`${stateCopy("generic").title} ${stateCopy("generic").body}`);
      return;
    }
    router.replace("/sign-in");
  }

  return { signingOut, failure, signOutNow: () => void run() };
}
