import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useSession } from "@/features/auth/client";

/** Session gate: no verified session → (auth); session → (tabs). Runs on every navigation. */
export default function RootLayout() {
  const { data, isPending } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    const inAuth = segments[0] === "(auth)";
    if (!data?.user && !inAuth) router.replace("/(auth)");
    if (data?.user && inAuth) router.replace("/(tabs)/proposals");
  }, [data?.user, isPending, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
