import { Linking, StyleSheet, Text, type TextStyle, View } from "react-native";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";
import { CAROUSEL_PAD, CarouselRow, Photo, PhotoCredit, baselineOffset, belowBaseline, rn, tokens } from "@bbc/ui";

import { optionsColumn } from "@/features/explore/destination-geometry";

import { type DestinationPhoto, landmarkTiles } from "./landmark-logic";
import { PICTURE_HEADERS } from "./usePlacePhotos";

type Role = TextStyle & { fontSize: number; lineHeight: number };

/**
 * The images draw no landmarks (ADR-IMPL-064 adds them after 3.0's design; design/components.md, `Landmarks`): the
 * section lines up under the flight options of the look it follows (`optionsColumn`: 04's page, 13's sheet) — its
 * title in their title's role and pen, the photographs as far under its baseline as their cards are, the row from
 * their cards' left edge to the screen's edge (`CarouselRow`) — and takes the rest from its neighbours: the
 * photographs 8.55 apart as 08's three fares, 118 tall as 03's popular photographs, radius 10 as 05's thumbnails, as
 * wide as their own shape; each name under its photograph as 03's city is (`subtitle`, its baseline 18.7 under it),
 * then the credit (`PhotoCredit`).
 */
const LOOK = {
  row: { gap: 8.55 },
  photo: { height: 118, radius: tokens.radius.sm },
  name: { role: rn(tokens.type.subtitle) as Role, baseline: 18.7 },
} as const;

type Props = {
  /** The city's landmarks as the server answered them (`usePlaceLandmarks`). */
  landmarks: readonly LandmarkVM[];
  /** The photographs that would not load, by address: left out with their names and credits until tried again. */
  failed: ReadonlySet<string>;
  /** A photograph would not load. */
  onPhotoError: (imageUrl: string) => void;
  testIDPrefix: "explore" | "destination";
} & (
  | {
      /** The flight options it follows: the destination's page (04). */
      look: "page";
      /**
       * The photograph over the page, as 04 chose it (`destinationPhoto`): a landmark showing it — one that stands in
       * for the city's photo (ADR-IMPL-064, amendment 1) — is left out (its `cityPhoto`), so one photograph is never
       * shown twice. The choice itself, not an address: the page cannot hand none, nor leave it unsaid, and compile.
       */
      photo: DestinationPhoto;
    }
  | {
      /** The flight options it follows: Explore's sheet at a chosen route (13), over the globe — no city photograph. */
      look: "route";
      photo?: never;
    }
);

/**
 * Up to three landmarks of the destination (ADR-IMPL-064), best first: each photograph with its name under it and the
 * credit its licence asks for, linked to the photograph's page. Fewer when fewer exist; none — nothing at all, no
 * title and no empty frame (a photograph that will not load leaves with its name and credit, and so does the one the
 * screen already shows as the city's). No skeleton: the images draw no slot for one.
 */
export function Landmarks({ landmarks, failed, onPhotoError, look, testIDPrefix, photo }: Props) {
  const tiles = landmarkTiles(landmarks, {
    headers: PICTURE_HEADERS,
    photoHeight: LOOK.photo.height,
    failed,
    // 04 leaves out the photograph over it; 13 draws the globe and leaves out none.
    cityPhoto: photo?.cityPhoto ?? null,
  });
  if (tiles.length === 0) return null;
  const column = optionsColumn(look);
  const title = rn(column.title.type) as Role;
  return (
    <View testID={`${testIDPrefix}.landmarks`}>
      <Text style={[title, styles.navy, { marginLeft: column.title.left - column.inset }]} accessibilityRole="header">
        Landmarks
      </Text>
      <View style={{ marginTop: column.toCards - belowBaseline(title) - CAROUSEL_PAD }}>
        <CarouselRow
          testID={`${testIDPrefix}.landmarks.row`}
          bleed={column.inset}
          inset={column.cardsLeft}
          gap={LOOK.row.gap}
        >
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
                    onError={() => onPhotoError(tile.imageUrl)}
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
