import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { Photo, type PhotoSource } from "./Photo";

type Props = {
  /** The member's initials (`DR`), shown while the club has no photo of them. */
  initials: string;
  /** The member's photo, once the club keeps one (ADR-IMPL-055: not yet). */
  photo?: PhotoSource | null;
  /** 56 in the greeting (02), 120 on Profile (12). */
  size: 56 | 120;
  testID?: string;
};

/**
 * The member's round portrait (02, 12): a white ring with the float shadow; inside, their photo — or, until the club
 * keeps one, their initials on navy.
 */
export function Avatar({ initials, photo, size, testID }: Props) {
  const ring = size >= 100 ? 5 : 3;
  const inner = size - ring * 2;
  return (
    <View
      testID={testID}
      style={[styles.ring, { width: size, height: size, padding: ring }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={initials ? `Your profile, ${initials}` : "Your profile"}
    >
      {photo ? (
        <Photo source={photo} fallback={null} style={[styles.inner, { width: inner, height: inner }]} />
      ) : (
        <View style={[styles.inner, styles.monogram, { width: inner, height: inner }]}>
          <Text style={size >= 100 ? styles.big : styles.small}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderRadius: tokens.radius.pill, backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  inner: { borderRadius: tokens.radius.pill, overflow: "hidden" },
  monogram: { backgroundColor: tokens.colors.actionPrimary, alignItems: "center", justifyContent: "center" },
  small: { ...rn(tokens.type.subtitle), color: tokens.colors.textOnPhoto },
  big: { ...rn(tokens.type.display), color: tokens.colors.textOnPhoto },
});
