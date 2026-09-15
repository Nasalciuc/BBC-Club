import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput } from "@/components/club-field";
import { Club } from "@/constants/club";
import { requestReset } from "@/features/auth/flows";
import { Email } from "@/features/auth/schemas";
import { authMessage } from "@bbc/shared/auth-messages";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = Email.safeParse(email).success && !busy;

  async function onSend() {
    const emailResult = Email.safeParse(email);
    if (!emailResult.success) {
      setError(emailResult.error.issues[0]?.message ?? authMessage("INVALID_EMAIL"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestReset(emailResult.data);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push({
      pathname: "/verify-code",
      params: { email: emailResult.data, purpose: "reset" },
    });
  }

  return (
    <AuthShell
      onBack="/sign-in"
      footer={
        <ClubButton testID="reset.send" label="Send code" arrow disabled={!canSend} onPress={() => void onSend()} />
      }
    >
      <View style={styles.copy}>
        <Text style={styles.headline}>Reset your password</Text>
        <Text style={styles.body}>Enter your email and we'll send you a code.</Text>
      </View>

      <ClubField label="Email">
        <ClubInput
          testID="reset.email"
          size="lg"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="Email address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
        />
      </ClubField>
      {error ? (
        <Text testID="reset.error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: Club.space.xs,
    marginBottom: Club.space.xl,
  },
  headline: {
    ...Club.type.display,
    color: Club.colors.textOnDark,
  },
  body: {
    ...Club.type.body,
    color: Club.colors.textOnDarkMuted,
  },
  error: {
    ...Club.type.bodySm,
    color: Club.colors.statusDanger,
    marginTop: Club.space.sm,
  },
});
