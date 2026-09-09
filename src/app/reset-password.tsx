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
      onBack={() => router.back()}
      footer={
        <ClubButton
          label="Send code"
          arrow
          disabled={!canSend}
          onPress={() =>
            router.push({
              pathname: "/verify-code",
              params: { email: email.trim() },
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
    gap: 8,
    marginBottom: Club.space.stackLg,
  },
  headline: {
    ...Club.type.headlineLg,
    color: Club.colors.white,
  },
  body: {
    ...Club.type.body,
    color: Club.colors.onPrimaryContainer,
  },
});
