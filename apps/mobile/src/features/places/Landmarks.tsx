import { useState } from "react";
import { Linking, StyleSheet, Text, type TextStyle, View } from "react-native";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";
import { CAROUSEL_PAD, CarouselRow, Photo, PhotoCredit, baselineOffset, belowBaseline, rn, tokens } from "@bbc/ui";

import { landmarkTiles } from "./landmark-logic";
import { PICTURE_HEADERS } from "./usePlacePhotos";

type Role = TextStyle & { fontSize: number; lineHeight: number };

/**
 * The images draw no landmarks (ADR-IMPL-064 adds them after 3.0's design): the section takes its measures from what
 * the destination's page (04) and its neighbours already draw — the title as 04's `Flight options` (its role, 17.93
 * in) with the photographs 9.5 under its baseline as 04's cards are; the row from 04's cards' left edge (11.2), the
 * photographs 8.55 apart as 08's three fares are, running to the screen's edge (`CarouselRow`); each photograph 118
 * tall as 03's popular photographs, radius 10 as 05's thumbnails, as wide as its own shape; its name under it as 03's
 * city is (`subtitle`, its baseline 18.7 under the photograph), then the credit (`PhotoCredit`).
 */
const LOOK = {
  title: { role: rn(tokens.type.placeOptions) as Role, left: 17.93, toPhotos: 9.5 },
  row: { inset: 11.2, gap: 8.55 },
  photo: { height: 118, radius: tokens.radius.sm },
  name: { role: rn(tokens.type.subtitle) as Role, baseline: 18.7 },
} as const;

/**
 * Up to three landmarks of the destination (ADR-IMPL-064), best first: each photograph with its name under it and the
 * credit its licence asks for, linked to the photograph's page. Fewer when fewer exist; none — nothing at all, no
 * title and no empty frame (a photograph that will not load leaves with its name and credit). No skeleton: the images
 * draw no slot.
 */
export function Landmarks({ landmarks, testIDPrefix }: { landmarks: readonly LandmarkVM[]; testIDPrefix: string }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const tiles = landmarkTiles(landmarks, { headers: PICTURE_HEADERS, photoHeight: LOOK.photo.height, failed });
  if (tiles.length === 0) return null;
  const title = LOOK.title.role;
  return (
    <View testID={`${testIDPrefix}.landmarks`}>
      <Text style={[title, styles.navy, { marginLeft: LOOK.title.left }]} accessibilityRole="header">
        Landmarks
      </Text>
      <View style={{ marginTop: LOOK.title.toPhotos - belowBaseline(title) - CAROUSEL_PAD }}>
        <CarouselRow testID={`${testIDPrefix}.landmarks.row`} bleed={0} inset={LOOK.row.inset} gap={LOOK.row.gap}>
          {tiles.map((tile) => {
            const link = tile.credit.link;
            return (
              <View key={tile.imageUrl} style={{ width: tile.photoWidth }}>
                <View
                  testID={`${testIDPrefix}.landmark.${tile.rank}`}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={tile.spoken}
                >
                  <Photo
                    source={tile.source}
                    fallback={null}
                    style={styles.photo}
                    onError={() => setFailed((before) => new Set(before).add(tile.imageUrl))}
                  />
                  <Text
                    style={[
                      LOOK.name.role,
                      styles.navy,
                      { marginTop: LOOK.name.baseline - baselineOffset(LOOK.name.role) },
                    ]}
                  >
                    {tile.name}
                  </Text>
                </View>
                {/* The credit the photograph owes (ADR-IMPL-064), opened as the city photo's is. */}
                <PhotoCredit
                  testID={`${testIDPrefix}.landmark.${tile.rank}.credit`}
                  label={tile.credit.label}
                  accessibilityLabel={tile.credit.spoken}
                  onPress={
                    link
                      ? () => {
                          Linking.openURL(link).catch(() => undefined);
                        }
                      : undefined
                  }
                />
              </View>
            );
          })}
        </CarouselRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navy: { color: tokens.colors.textPrimary },
  photo: { height: LOOK.photo.height, borderRadius: LOOK.photo.radius },
});
