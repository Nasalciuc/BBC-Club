import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput } from "@/components/club-field";
import { Club } from "@/constants/club";
import { join } from "@/features/auth/flows";
import { Email } from "@/features/auth/schemas";
import { authMessage } from "@bbc/shared/auth-messages";

export default function JoinScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Email.safeParse(email);
  const canContinue = parsed.success && !busy;

  async function onContinue() {
    const emailResult = Email.safeParse(email);
    if (!emailResult.success) {
      setError(emailResult.error.issues[0]?.message ?? authMessage("INVALID_EMAIL"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await join(emailResult.data);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push({
      pathname: "/verify-code",
      params: { email: emailResult.data, purpose: "join" },
    });
  }

  return (
    <AuthShell
      logo="center"
      onBack="/sign-in"
      footer={
        <>
          <ClubButton
            testID="join.continue"
            label="Continue"
            arrow
            disabled={!canContinue}
            onPress={() => void onContinue()}
          />
          <View style={styles.memberRow}>
            <Text style={styles.member}>Already a member? </Text>
            <Pressable
              testID="join.signIn"
              accessibilityRole="link"
              hitSlop={Club.space.sm}
              onPress={() => router.replace("/sign-in")}
            >
              <Text style={styles.memberLink}>Sign in</Text>
            </Pressable>
          </View>
        </>
      }
    >
      <View style={styles.copy}>
        <Text style={styles.headline}>Join the club</Text>
        <Text style={styles.body}>
          If you've flown with us, use the email your advisor has on file — we'll recognise you and set things up. If
          you're new, we'll add you to the list.
        </Text>
      </View>

      <ClubField label="Email">
        <ClubInput
          testID="join.email"
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
        <Text testID="join.error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: Club.space.sm,
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
  memberRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: Club.space.xs,
  },
  member: {
    ...Club.type.bodySm,
    color: Club.colors.textOnDarkMuted,
  },
  memberLink: {
    ...Club.type.bodySm,
    color: Club.colors.textOnDark,
  },
  error: {
    ...Club.type.bodySm,
    color: Club.colors.statusDanger,
    marginTop: Club.space.sm,
  },
});
