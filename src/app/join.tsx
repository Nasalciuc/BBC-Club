import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput } from "@/components/club-field";
import { Club } from "@/constants/club";

export default function JoinScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const canContinue = email.includes("@") && email.includes(".");

  return (
    <AuthShell
      logo="center"
      onBack={() => router.back()}
      footer={
        <>
          <ClubButton
            label="Continue"
            arrow
            disabled={!canContinue}
            onPress={() =>
              router.push({
                pathname: "/verify-code",
                params: { email: email.trim() },
              })
            }
          />
          <View style={styles.memberRow}>
            <Text style={styles.member}>Already a member? </Text>
            <Pressable accessibilityRole="link" onPress={() => router.replace("/sign-in")}>
              <Text style={styles.memberLink}>Sign in</Text>
            </Pressable>
          </View>
        </>
      }
    >
      <View style={styles.copy}>
        <Text style={styles.headline}>Join the club</Text>
        <Text style={styles.body}>
          If you've flown with us, use the email your advisor has on file — we'll recognise you.
        </Text>
      </View>

      <ClubField label="Email">
        <ClubInput
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
    gap: Club.space.stackSm,
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
  memberRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 8,
  },
  member: {
    ...Club.type.bodySm,
    color: Club.colors.onPrimaryContainer,
  },
  memberLink: {
    ...Club.type.bodySm,
    color: Club.colors.white,
  },
});
