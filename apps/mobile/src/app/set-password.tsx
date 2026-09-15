import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { parseAuthPurpose } from "@/lib/auth-purpose";
import { clearPendingOtp, takePendingOtp } from "@/features/auth/otp-holder";
import { resetPassword, setPassword } from "@/features/auth/flows";
import { Password } from "@/features/auth/schemas";
import { resolvePostAuthRoute } from "@/features/auth/session-gate";
import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubPasswordInput } from "@/components/club-field";
import { PasswordRule } from "@/components/password-rule";
import { Club } from "@/constants/club";

function hasNumberOrSymbol(value: string) {
  return /[\d\W]/.test(value);
}

export default function SetPasswordScreen() {
  const router = useRouter();
  const { email, purpose: purposeParam } = useLocalSearchParams<{
    email?: string;
    purpose?: string;
  }>();
  const purpose = parseAuthPurpose(purposeParam);
  const [password, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => clearPendingOtp(), []);

  const longEnough = password.length >= 8;
  const complexEnough = hasNumberOrSymbol(password);
  const canContinue = longEnough && complexEnough && !busy;

  async function onContinue() {
    const parsed = Password.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
      return;
    }

    setBusy(true);
    setError(null);

    if (purpose === "reset") {
      const otp = takePendingOtp();
      const normalizedEmail = email?.trim().toLowerCase() ?? "";
      if (!otp || !normalizedEmail) {
        clearPendingOtp();
        setBusy(false);
        router.replace("/sign-in");
        return;
      }
      const result = await resetPassword(normalizedEmail, otp, parsed.data);
      if (!result.ok) {
        setBusy(false);
        setError(result.message);
        return;
      }
    } else {
      const result = await setPassword(parsed.data);
      if (!result.ok) {
        setBusy(false);
        setError(result.message);
        return;
      }
    }

    const dest = await resolvePostAuthRoute();
    setBusy(false);
    router.replace(dest);
  }

  return (
    <AuthShell
      heroPercent={0.25}
      onBack="/sign-in"
      footer={
        <ClubButton
          testID="setPassword.continue"
          label="Continue"
          arrow
          disabled={!canContinue}
          onPress={() => void onContinue()}
        />
      }
    >
      <View style={styles.copy}>
        <Text style={styles.kicker}>Your key</Text>
        <Text style={styles.headline}>Choose your password</Text>
        <Text style={styles.body}>You'll use it together with your email to sign in.</Text>
      </View>

      <ClubField label="Password">
        <ClubPasswordInput
          testID="setPassword.password"
          toggleTestID="setPassword.togglePassword"
          autoComplete="new-password"
          placeholder="Password"
          value={password}
          onChangeText={(value) => {
            setPasswordValue(value);
            setError(null);
          }}
          visible={showPassword}
          onToggleVisibility={() => setShowPassword((value) => !value)}
        />
      </ClubField>

      <View style={styles.rules}>
        <PasswordRule ok={longEnough} label="At least 8 characters" />
        <PasswordRule ok={complexEnough} label="One number or symbol" />
      </View>

      {error ? (
        <Text testID="setPassword.error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  copy: {
    marginBottom: Club.space.xl,
  },
  kicker: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: Club.space.sm,
  },
  headline: {
    ...Club.type.display,
    color: Club.colors.textOnDark,
    marginBottom: Club.space.xs,
  },
  body: {
    ...Club.type.body,
    color: Club.colors.textOnDarkMuted,
  },
  rules: {
    marginTop: Club.space.lg,
    gap: Club.space.sm,
  },
  error: {
    ...Club.type.bodySm,
    color: Club.colors.statusDanger,
    marginTop: Club.space.md,
  },
});
