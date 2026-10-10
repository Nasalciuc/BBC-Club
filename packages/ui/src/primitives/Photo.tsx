import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { tokens } from "../tokens";

/** A remote photograph, with the headers its host asks for, or a bundled image (the number `require` gives). */
export type PhotoSource = { uri: string; headers?: Record<string, string> } | number;

type Props = {
  source: PhotoSource | null;
  /** Shown when there is no source, and when the source cannot load. */
  fallback: PhotoSource | null;
  /** `memory` for an image whose terms ask that it not be kept (a satellite view); a photograph stays on disk. */
  cachePolicy?: "memory" | "disk" | "memory-disk";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const keyOf = (source: PhotoSource | null) =>
  source === null ? null : typeof source === "number" ? `asset:${source}` : source.uri;

/**
 * A photograph in its slot (design/components.md, photo-placeholder): `surface-muted` while it loads — never a spinner —
 * and the fallback when it cannot load. Decorative: what the photograph shows is said by the text beside it.
 */
export function Photo({ source, fallback, cachePolicy = "disk", style, testID }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const key = keyOf(source);
  const useFallback = key === null || failed === key;
  const shown = useFallback ? fallback : source;
  return (
    <View
      testID={testID}
      style={[styles.slot, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {shown !== null ? (
        <Image
          source={shown}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={tokens.motion.stagger}
          cachePolicy={useFallback ? "memory-disk" : cachePolicy}
          recyclingKey={keyOf(shown)}
          onError={() => {
            if (!useFallback) setFailed(key);
          }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { backgroundColor: tokens.colors.surfaceMuted, overflow: "hidden" },
});
