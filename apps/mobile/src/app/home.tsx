import { Redirect } from "expo-router";

/** Legacy route — Block 5 interior lives under (tabs)/proposals. */
export default function HomeRedirect() {
  return <Redirect href="/(tabs)/proposals" />;
}
