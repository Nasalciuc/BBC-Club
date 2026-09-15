import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput, ClubPasswordInput } from "@/components/club-field";
import { Club } from "@/constants/club";
import { signIn } from "@/features/auth/flows";
import { Email } from "@/features/auth/schemas";
import { resolvePostAuthRoute } from "@/features/auth/session-gate";
import { authMessage } from "@bbc/shared/auth-messages";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Email.safeParse(email).success && password.length > 0 && !busy;

  async function onSubmit() {
    const emailResult = Email.safeParse(email);
    if (!emailResult.success) {
      setError(emailResult.error.issues[0]?.message ?? authMessage("INVALID_EMAIL"));
      return;
    }
    // Sign-in validates remotely; local Password refine is for set/reset screens.
    if (!password) {
      setError(authMessage("INVALID_EMAIL_OR_PASSWORD"));
      return;
    }

    setBusy(true);
    setError(null);
    const result = await signIn(emailResult.data, password);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    const dest = await resolvePostAuthRoute();
    setBusy(false);
    router.replace(dest);
  }

  return (
    <AuthShell
      logo="left"
      footer={
        <>
          <ClubButton
            testID="signIn.submit"
            label="Sign in"
            arrow
            disabled={!canSubmit}
            onPress={() => void onSubmit()}
          />
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>New to the club</Text>
            <View style={styles.dividerLine} />
          </View>
          <ClubButton
            testID="signIn.createAccount"
            label="Create account"
            variant="secondary"
            onPress={() => router.push("/join")}
          />
        </>
      }
    >
      <Text style={styles.headline}>Welcome back</Text>

      <View style={styles.fields}>
        <ClubField label="Email">
          <ClubInput
            testID="signIn.email"
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

        <ClubField label="Password">
          <ClubPasswordInput
            testID="signIn.password"
            toggleTestID="signIn.togglePassword"
            size="md"
            autoComplete="password"
            placeholder="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            visible={showPassword}
            onToggleVisibility={() => setShowPassword((value) => !value)}
          />
          <Pressable
            testID="signIn.forgot"
            accessibilityRole="link"
            hitSlop={Club.space.sm}
            style={styles.forgotWrap}
            onPress={() => router.push("/reset-password")}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </ClubField>

        {error ? (
          <Text testID="signIn.error" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...Club.type.display,
    color: Club.colors.textOnDark,
    marginBottom: Club.space.xl,
  },
  fields: {
    gap: Club.space.lg,
    flexGrow: 1,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: Club.space.xs,
  },
  forgot: {
    ...Club.type.bodySm,
    color: Club.colors.textOnDarkMuted,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Club.space.md,
    paddingVertical: Club.space.xs,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Club.colors.borderOnDark,
  },
  dividerLabel: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textTransform: "uppercase",
  },
  error: {
    ...Club.type.bodySm,
    color: Club.colors.statusDanger,
  },
});
