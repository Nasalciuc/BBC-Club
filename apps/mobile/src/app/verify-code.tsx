import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { parseAuthPurpose } from "@/lib/auth-purpose";
import { setPendingOtp } from "@/features/auth/otp-holder";
import { checkResetCode, resendCode, verifyJoin } from "@/features/auth/flows";
import { leaveTo } from "@/features/auth/leave";
import { passwordStillPending, resolvePostAuthRoute } from "@/features/auth/session-gate";
import { Otp } from "@/features/auth/schemas";
import {
  afterResetNotice,
  afterVerifyError,
  formatResendCountdown,
  resendDeadline,
  secondsLeft,
  type VerifyErrorPlan,
} from "@/features/auth/verify-code-logic";
import { AuthShell } from "@/components/auth-shell";
import { ClubButton } from "@/components/club-button";
import { Club } from "@/constants/club";

const CODE_LENGTH = 6;

export default function VerifyCodeScreen() {
  const router = useRouter();
  const {
    email,
    purpose: purposeParam,
    notice,
  } = useLocalSearchParams<{
    email?: string;
    purpose?: string;
    notice?: string;
  }>();
  const purpose = parseAuthPurpose(purposeParam);
  const inputRef = useRef<TextInput>(null);
  // Back from set-password, whose reset refused the code: `notice` names why, never the code (verify-code-logic.ts).
  const [noticePlan] = useState(() => afterResetNotice(notice));
  const [code, setCode] = useState("");
  // Resend opens at a wall-clock deadline (verify-code-logic.ts): a timer chain stops while the app is in the background.
  // A dead code from set-password opens it at once.
  const [deadline, setDeadline] = useState(() => (noticePlan?.resendNow ? Date.now() : resendDeadline(Date.now())));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    noticePlan && !noticePlan.resend ? noticePlan.message : null,
  );
  const seconds = secondsLeft(deadline, now);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(id);
  }, [seconds, now]);

  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => code[index] ?? "");
  const canVerify = code.length === CODE_LENGTH && !busy;
  const destination = email?.trim() || "your email";

  /** Ask the server to mail a code again; Resend waits its 30 s from now. */
  async function sendNewCode(normalizedEmail: string) {
    const sentAt = Date.now();
    setDeadline(resendDeadline(sentAt));
    setNow(sentAt);
    return resendCode(normalizedEmail, purpose);
  }

  /**
   * A code the server refused (verify-code-logic.ts): a dead one empties the boxes and opens Resend at once; an expired
   * one is replaced at once — the words promise it — and if that send fails, its own error is shown instead.
   */
  async function applyPlan(plan: VerifyErrorPlan, fallback: string, normalizedEmail: string) {
    if (plan.clear) setCode("");
    if (plan.resendNow) {
      const at = Date.now();
      setDeadline(at);
      setNow(at);
    }
    if (plan.resend) {
      const sent = await sendNewCode(normalizedEmail);
      if (!sent.ok) {
        setError(sent.message);
        return;
      }
    }
    setError(plan.message ?? fallback);
  }

  // Back from set-password with an expired code: a new one is sent at once, as on Verify itself — once. Resend's 30 s
  // started with the screen.
  const noticeSent = useRef(false);
  useEffect(() => {
    const normalizedEmail = email?.trim().toLowerCase() ?? "";
    if (!noticePlan?.resend || !normalizedEmail || noticeSent.current) return;
    noticeSent.current = true;
    setBusy(true);
    void resendCode(normalizedEmail, purpose).then((sent) => {
      setError(sent.ok ? noticePlan.message : sent.message);
      setBusy(false);
    });
  }, [noticePlan, email, purpose]);

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

    setBusy(true);
    setError(null);

    if (purpose === "reset") {
      // Checked here, where the boxes are: a wrong, expired or dead code stays on Verify. A right one is not used up —
      // set-password's reset consumes it.
      const checked = await checkResetCode(normalizedEmail, otpResult.data);
      if (!checked.ok) {
        await applyPlan(afterVerifyError(checked.code), checked.message, normalizedEmail);
        setBusy(false);
        return;
      }
      setPendingOtp(otpResult.data);
      setBusy(false);
      router.replace({
        pathname: "/set-password",
        params: { purpose: "reset", email: normalizedEmail },
      });
      return;
    }

    const result = await verifyJoin(normalizedEmail, otpResult.data);
    if (!result.ok) {
      await applyPlan(afterVerifyError(result.code), result.message, normalizedEmail);
      setBusy(false);
      return;
    }
    // A member who already has a password goes straight in; only a new member chooses one. Either way the entry screens
    // go: Back must not show Join to a signed-in member (features/auth/leave.ts).
    if (!passwordStillPending()) {
      const dest = await resolvePostAuthRoute();
      setBusy(false);
      leaveTo(router, dest);
      return;
    }
    setBusy(false);
    leaveTo(router, {
      pathname: "/set-password",
      params: { purpose: "join" },
    });
  }

  async function onResend() {
    const normalizedEmail = email?.trim().toLowerCase() ?? "";
    if (!normalizedEmail || seconds > 0) return;
    setCode("");
    setError(null);
    const result = await sendNewCode(normalizedEmail);
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
          {seconds > 0 ? `Resend code (${formatResendCountdown(seconds)})` : "Resend code"}
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
    // The words of an error stay quiet on the navy panel (DESIGN.md: never red for messages): 5.71:1 (ADR-IMPL-047).
    color: Club.colors.textOnDarkMuted,
    marginTop: Club.space.sm,
  },
});
