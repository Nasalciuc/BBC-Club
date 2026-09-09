import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { Club } from "@/constants/club";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyCodeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => code[index] ?? "");
  const canVerify = code.length === CODE_LENGTH;
  const destination = email?.trim() || "your email";

  return (
    <AuthShell
      onBack={() => router.back()}
      footer={
        <ClubButton
          testID="verify.submit"
          label="Verify"
          arrow
          disabled={!canVerify}
          onPress={() =>
            router.push({
              pathname: "/set-password",
              params: { email: email ?? "" },
            })
          }
        />
      }
    >
      <View style={styles.copy}>
        <Text style={styles.headline}>Check your email</Text>
        <Text style={styles.body}>
          We sent a code to <Text style={styles.email}>{destination}</Text>
        </Text>
      </View>

      <Pressable onPress={() => inputRef.current?.focus()} style={styles.boxes}>
        {digits.map((digit, index) => {
          const focused =
            index === code.length || (code.length === CODE_LENGTH && index === CODE_LENGTH - 1);
          return (
            <View key={index} style={[styles.box, focused && styles.boxFocused]}>
              <Text style={styles.digit}>{digit}</Text>
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          testID="verify.code"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          caretHidden
          style={styles.hiddenInput}
          autoFocus
        />
      </Pressable>

      <Pressable
        testID="verify.resend"
        accessibilityRole="link"
        hitSlop={Club.space.sm}
        disabled={seconds > 0}
        onPress={() => {
          setSeconds(RESEND_SECONDS);
          setCode("");
        }}
        style={styles.resendWrap}
      >
        <Text style={styles.resend}>
          {seconds > 0 ? `Resend code (0:${String(seconds).padStart(2, "0")})` : "Resend code"}
        </Text>
      </Pressable>
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
  email: {
    color: Club.colors.textOnDark,
  },
  boxes: {
    flexDirection: "row",
    gap: Club.space.xs,
  },
  box: {
    flex: 1,
    height: 56,
    borderRadius: Club.radius.field,
    backgroundColor: Club.colors.surfaceCard,
    borderWidth: 1,
    borderColor: Club.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFocused: {
    borderWidth: 2,
    borderColor: Club.colors.textSecondary,
  },
  digit: {
    ...Club.type.headline,
    color: Club.colors.textPrimary,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.01,
    color: "transparent",
  },
  resendWrap: {
    alignSelf: "flex-start",
    marginTop: Club.space.lg,
  },
  resend: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textTransform: "uppercase",
  },
});
