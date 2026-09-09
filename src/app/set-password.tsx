import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const longEnough = password.length >= 8;
  const complexEnough = hasNumberOrSymbol(password);
  const canContinue = longEnough && complexEnough;

  const rules = useMemo(
    () => [
      { ok: longEnough, label: "At least 8 characters" },
      { ok: complexEnough, label: "One number or symbol" },
    ],
    [complexEnough, longEnough],
  );

  return (
    <AuthShell
      heroPercent={0.25}
      panelRadius={Club.radius.panelTight}
      onBack={() => router.back()}
      footer={
        <ClubButton
          label="Continue"
          arrow
          disabled={!canContinue}
          onPress={() => router.replace("/sign-in")}
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
          autoComplete="new-password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          visible={showPassword}
          onToggleVisibility={() => setShowPassword((value) => !value)}
        />
      </ClubField>

      <View style={styles.rules}>
        {rules.map((rule) => (
          <PasswordRule key={rule.label} ok={rule.ok} label={rule.label} />
        ))}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  copy: {
    marginBottom: Club.space.stackLg,
  },
  kicker: {
    ...Club.type.label,
    color: Club.colors.onPrimaryContainer,
    textTransform: "uppercase",
    marginBottom: Club.space.stackSm,
  },
  headline: {
    ...Club.type.headlineLg,
    color: Club.colors.white,
    marginBottom: 8,
  },
  body: {
    ...Club.type.body,
    color: Club.colors.onPrimaryContainer,
  },
  rules: {
    marginTop: Club.space.stackMd,
    gap: 12,
  },
});
