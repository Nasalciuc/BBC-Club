import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { ClubField, ClubInput, ClubPasswordInput } from "@/components/club-field";
import { Club } from "@/constants/club";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthShell
      logo="left"
      footer={
        <>
          <ClubButton label="Sign in" arrow onPress={() => undefined} />
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>New to the club</Text>
            <View style={styles.dividerLine} />
          </View>
          <ClubButton
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
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
          />
        </ClubField>

        <ClubField label="Password">
          <ClubPasswordInput
            size="md"
            autoComplete="password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            visible={showPassword}
            onToggleVisibility={() => setShowPassword((value) => !value)}
          />
          <Pressable
            accessibilityRole="button"
            style={styles.forgotWrap}
            onPress={() => router.push("/reset-password")}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </ClubField>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  headline: {
    ...Club.type.headlineLg,
    color: Club.colors.white,
    marginBottom: Club.space.stackLg,
  },
  fields: {
    gap: Club.space.stackMd,
    flexGrow: 1,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: 8,
  },
  forgot: {
    ...Club.type.bodySm,
    color: Club.colors.onPrimaryContainer,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(117,119,125,0.2)",
  },
  dividerLabel: {
    ...Club.type.label,
    color: Club.colors.onPrimaryContainer,
    textTransform: "uppercase",
  },
});
