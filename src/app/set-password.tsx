import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { parseAuthPurpose } from "@/lib/auth-purpose";
import { clearPendingOtp, takePendingOtp } from "@/features/auth/otp-holder";
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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => () => clearPendingOtp(), []);

  const longEnough = password.length >= 8;
  const complexEnough = hasNumberOrSymbol(password);
  const canContinue = longEnough && complexEnough;

  function onContinue() {
    if (purpose === "reset") {
      // TODO(identity): the reset call needs the code; see Task 1b
      // emailOtp.resetPassword({ email, otp, password }) — otp from
      // takePendingOtp(); must not enter navigation state or the URL.
      if (!email) {
        clearPendingOtp();
        router.replace("/sign-in");
        return;
      }
      takePendingOtp();
      router.replace("/home");
      return;
    }

    // TODO(identity): setPassword on the session (ADR-PROD-001 path A)
    router.replace("/home");
  }

  return (
    <AuthShell
      heroPercent={0.25}
      onBack="/sign-in"
      footer={
        <ClubButton testID="setPassword.continue" label="Continue" arrow disabled={!canContinue} onPress={onContinue} />
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
          onChangeText={setPassword}
          visible={showPassword}
          onToggleVisibility={() => setShowPassword((value) => !value)}
        />
      </ClubField>

      <View style={styles.rules}>
        <PasswordRule ok={longEnough} label="At least 8 characters" />
        <PasswordRule ok={complexEnough} label="One number or symbol" />
      </View>
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
});
