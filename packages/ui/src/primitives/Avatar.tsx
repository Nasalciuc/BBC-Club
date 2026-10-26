import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { Photo, type PhotoSource } from "./Photo";

type Props = {
  /** The member's initials (`DR`), shown while the club has no photo of them; empty — the club has no name for them
   *  either, and the portrait shows the person glyph. */
  initials: string;
  /** The member's photo, where the club keeps one (`ProfileVM.avatarUrl`, ADR-IMPL-056). */
  photo?: PhotoSource | null;
  /** The portrait's diameter with its ring as the screen draws it: 54.8 in the greeting (02), 113.6 on Profile (12). */
  size: number;
  /** The white ring's width: 3.8 on Profile, 1 in the greeting. */
  ring?: number;
  /** The soft shadow under the portrait (12); the greeting's has none (02). */
  shadow?: boolean;
  testID?: string;
};

/**
 * The member's round portrait (02, 12): their photo — or, until the club keeps one, their initials on navy — in a white
 * ring. A member the club has no name for (one who joined by email) gets the person glyph, never an empty disc. The
 * monogram stays under the photo: while the photo loads, and if it cannot load, the portrait still shows who it is.
 */
export function Avatar({ initials, photo, size, ring = size >= 100 ? 3.8 : 1, shadow = size >= 100, testID }: Props) {
  const inner = size - ring * 2;
  return (
    <View
      testID={testID}
      style={[styles.ring, shadow && styles.shadow, { width: size, height: size, padding: ring }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={initials ? `Your profile, ${initials}` : "Your profile"}
    >
      <View style={[styles.inner, styles.monogram, { width: inner, height: inner }]}>
        {initials ? (
          <Text style={[size >= 100 ? styles.big : styles.small]}>{initials}</Text>
        ) : (
          <Icon name="user" size={Math.round(inner * 0.46)} color={tokens.colors.textOnPhoto} />
        )}
        {photo ? <Photo source={photo} fallback={null} style={[StyleSheet.absoluteFill, styles.photo]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderRadius: tokens.radius.pill, backgroundColor: tokens.colors.surfaceCard },
  // 12: a soft shadow under the ring, ≈9 pt, strongest straight down.
  shadow: { ...tokens.elevation.card },
  inner: { borderRadius: tokens.radius.pill, overflow: "hidden" },
  monogram: { backgroundColor: tokens.colors.actionPrimary, alignItems: "center", justifyContent: "center" },
  // The photo's slot is light tint while it loads and empty when it fails: here the monogram under it shows instead.
  photo: { backgroundColor: "transparent" },
  small: { ...rn(tokens.type.subtitle), color: tokens.colors.textOnPhoto },
  big: { ...rn(tokens.type.display), color: tokens.colors.textOnPhoto },
});
