import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { Button } from "../primitives/Button";
import type { PhotoSource } from "../primitives/Photo";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void; testID?: string };
  /** `outline` for a quiet way out (`Clear search`, 15). */
  primaryVariant?: "primary" | "outline";
  /** False: the pill hugs its words, centred (`Search a destination`, 17). */
  primaryFill?: boolean;
  /** A picture above the words (10: the seat, the window, the boarding pass). */
  illustration?: PhotoSource;
  /** The picture's width over its height; 1 by default. */
  illustrationRatio?: number;
  /** An icon above the words (15: the magnifier). */
  icon?: IconName;
  testID: string;
};

/**
 * An empty state (10, 15, 17; sheet 41): centred — a picture or an icon, the title in `headline`, the words in slate,
 * then the way on. The parent gives the gutters.
 */
export function EmptyState({
  title,
  body,
  primary,
  primaryVariant = "primary",
  primaryFill = true,
  illustration,
  illustrationRatio = 1,
  icon,
  testID,
}: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      {illustration ? (
        <Image
          source={illustration}
          style={[styles.illustration, { aspectRatio: illustrationRatio }]}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : null}
      {icon ? <Icon name={icon} size={44} color={tokens.colors.textSecondary} strokeWidth={1.5} /> : null}
      <View style={styles.message}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {primary ? (
        <Button
          testID={primary.testID ?? `${testID}.primary`}
          label={primary.label}
          onPress={primary.onPress}
          variant={primaryVariant}
          fill={primaryFill}
          size={primaryVariant === "outline" ? "md" : "lg"}
          style={primaryFill ? undefined : styles.hugging}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", alignItems: "center", gap: tokens.space.lg },
  illustration: { width: "100%" },
  message: { gap: tokens.space.sm, alignItems: "center" },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, textAlign: "center" },
  body: { ...rn(tokens.type.bodyLg), color: tokens.colors.textSecondary, textAlign: "center" },
  hugging: { minWidth: 220, paddingHorizontal: tokens.space.xxl },
});
