import { useState } from "react";
import { useRouter } from "expo-router";
import { signIn } from "@/features/auth/flows";
import { Email, Password } from "@/features/auth/schemas";
import { AuthShell, ClubButton, ClubField, ClubInput, ClubPasswordInput } from "@bbc/ui";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = Email.safeParse(email).success && Password.safeParse(password).success;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await signIn(Email.parse(email), password);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.replace("/(tabs)/proposals");
  }

  return (
    <AuthShell title="Welcome back" showBack={false} showLogo>
      <ClubField label="EMAIL">
        <ClubInput
          testID="signIn.email"
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          placeholder="Email address"
        />
      </ClubField>
      <ClubField label="PASSWORD" error={error ?? undefined}>
        <ClubPasswordInput
          testID="signIn.password"
          value={password}
          onChangeText={setPassword}
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={submit}
        />
      </ClubField>
      <ClubButton testID="signIn.submit" label="Sign in" arrow onPress={submit} disabled={!valid} loading={busy} />
      {/* ... Forgot password link, divider NEW TO THE CLUB?, outlined Create account — unchanged from commit 1 */}
    </AuthShell>
  );
}
