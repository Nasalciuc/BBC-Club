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
            testID="join.continue"
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
          If you've flown with us, use the email your advisor has on file — we'll recognise you.
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
          onChangeText={setEmail}
        />
      </ClubField>
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
});
