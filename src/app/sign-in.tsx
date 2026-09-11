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
          <ClubButton
            testID="signIn.submit"
            label="Sign in"
            arrow
            onPress={() => {
              // TODO(identity): wire to Better Auth
              router.replace("/home");
            }}
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
            onChangeText={setEmail}
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
            onChangeText={setPassword}
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
});
