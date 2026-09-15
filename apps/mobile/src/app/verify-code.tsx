import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { parseAuthPurpose } from "@/lib/auth-purpose";
import { setPendingOtp } from "@/features/auth/otp-holder";
import { resendCode, verifyJoin } from "@/features/auth/flows";
import { Otp } from "@/features/auth/schemas";
import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { Club } from "@/constants/club";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyCodeScreen() {
  const router = useRouter();
  const { email, purpose: purposeParam } = useLocalSearchParams<{
    email?: string;
    purpose?: string;
  }>();
  const purpose = parseAuthPurpose(purposeParam);
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => code[index] ?? "");
  const canVerify = code.length === CODE_LENGTH && !busy;
  const destination = email?.trim() || "your email";

  async function onVerify() {
    const otpResult = Otp.safeParse(code);
    if (!otpResult.success) {
      setError(otpResult.error.issues[0]?.message ?? "Enter the 6-digit code.");
      return;
    }
    const normalizedEmail = email?.trim().toLowerCase() ?? "";
    if (!normalizedEmail) {
      router.replace("/sign-in");
      return;
    }

    if (purpose === "reset") {
      setPendingOtp(otpResult.data);
      router.replace({
        pathname: "/set-password",
        params: { purpose: "reset", email: normalizedEmail },
      });
      return;
    }

    setBusy(true);
    setError(null);
    const result = await verifyJoin(normalizedEmail, otpResult.data);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace({
      pathname: "/set-password",
      params: { purpose: "join" },
    });
  }

  async function onResend() {
    const normalizedEmail = email?.trim().toLowerCase() ?? "";
    if (!normalizedEmail || seconds > 0) return;
    setSeconds(RESEND_SECONDS);
    setCode("");
    setError(null);
    const result = await resendCode(normalizedEmail, purpose);
    if (!result.ok) setError(result.message);
  }

  return (
    <AuthShell
      onBack="/sign-in"
      footer={
        <ClubButton testID="verify.submit" label="Verify" arrow disabled={!canVerify} onPress={() => void onVerify()} />
      }
    >
      <View style={styles.copy}>
        <Text style={styles.headline}>Check your email</Text>
        <Text style={styles.body}>
          We sent a code to <Text style={styles.email}>{destination}</Text>
        </Text>
      </View>

      <Pressable testID="verify.codeBoxes" onPress={() => inputRef.current?.focus()} style={styles.boxes}>
        {digits.map((digit, index) => {
          const focused = index === code.length || (code.length === CODE_LENGTH && index === CODE_LENGTH - 1);
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
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
            setError(null);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          caretHidden
          style={styles.hiddenInput}
          autoFocus
        />
      </Pressable>

      {error ? (
        <Text testID="verify.error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="verify.resend"
        accessibilityRole="link"
        hitSlop={Club.space.sm}
        disabled={seconds > 0}
        onPress={() => void onResend()}
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
  error: {
    ...Club.type.bodySm,
    color: Club.colors.statusDanger,
    marginTop: Club.space.sm,
  },
});
