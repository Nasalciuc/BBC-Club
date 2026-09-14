import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput } from "@/components/club-field";
import { Club } from "@/constants/club";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const canSend = email.includes("@") && email.includes(".");

  return (
    <AuthShell
      onBack="/sign-in"
      footer={
        <ClubButton
          testID="reset.send"
          label="Send code"
          arrow
          disabled={!canSend}
          onPress={() =>
            router.push({
              pathname: "/verify-code",
              params: { email: email.trim(), purpose: "reset" },
            })
          }
        />
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
          onChangeText={setEmail}
        />
      </ClubField>
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
});
