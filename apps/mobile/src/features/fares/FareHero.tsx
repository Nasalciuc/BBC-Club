import type { ImageContentPosition } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { BackButton, PageDots, Photo, type PhotoSource, PhotoThumbs, tokens } from "@bbc/ui";

/** One photograph of the fare's carousel (05): the city's, then the seat's and the lounge's. */
export type HeroPage = {
  source: PhotoSource | null;
  /** Its thumbnail: the package's own small cut where it has one, else the photograph itself. */
  thumb?: PhotoSource | null;
  label: string;
  position?: ImageContentPosition;
  cache?: "memory" | "disk" | "memory-disk";
};

/** The images' status bar: content sits where they put it on 47 pt, and moves down with a taller safe area. */
const STATUS = 47;

/**
 * 05 from the screen's top on a 47-pt status bar: the photograph from 19 above the screen, 264.7 tall (the city's
 * 3:2 photo in cover, held at its top right), fading into the page from 188 to 236; the round buttons 33.7 across at
 * 39.7 — back 12 in, share at 306.7, the heart at 347.8; the thumbnails from 175.5, 12.2 in; the dots on 245.5. 21: the
 * photograph alone, fading from 172 to 212, and back.
 */
export const FARE_HERO = {
  photo: { top: -19, height: 264.7 },
  fade: { from: 188, to: 236 },
  goneFade: { from: 172, to: 212 },
  round: { top: 39.7, size: 33.7, back: 12, share: 306.7, heart: 347.8 },
  // 05's chevron: 22.3 at 1.64, drawn 0.7 left of the circle's centre.
  backGlyph: { size: 22.3, stroke: 1.64, shift: 0.7 },
  thumbs: { top: 175.5, left: 12.2 },
  dots: { centre: 245.5, size: 6.5 },
} as const;

/** Where the hero ends on a 47-pt status bar: the dots' foot (05), the fade's end (21). */
export function fareHeroBottom(gone: boolean): number {
  return gone ? FARE_HERO.goneFade.to : FARE_HERO.dots.centre + FARE_HERO.dots.size / 2;
}

/**
 * The fare's photographs (05): swiped one by one, or chosen by their thumbnails, the dots saying which shows; back
 * over the photograph at the left and the page's own buttons (share, the heart) at the right. A closed fare (21) keeps
 * the city's photograph and back only.
 */
export function FareHero({
  pages,
  insetTop,
  onBack,
  actions,
  gone = false,
  testID,
}: {
  pages: readonly HeroPage[];
  insetTop: number;
  onBack: () => void;
  /** The round buttons at the right (share, the heart), placed by the screen. */
  actions?: (frame: { top: number; size: number }) => ReactNode;
  gone?: boolean;
  testID: string;
}) {
  const window = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);
  // The pages are as wide as the hero itself, read from its layout (a static web render starts with no window).
  const [laidOut, setLaidOut] = useState(0);
  const width = laidOut || window.width;
  const dy = insetTop - STATUS;
  const h = FARE_HERO;
  const fade = gone ? h.goneFade : h.fade;
  const height = fareHeroBottom(gone) + dy;
  const shown = gone ? pages.slice(0, 1) : pages;
  const fadeTop = fade.from + dy;
  const several = shown.length > 1;

  return (
    <View
      style={{ height }}
      testID={testID}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (next > 0 && Math.abs(next - laidOut) > 0.5) setLaidOut(next);
      }}
    >
      {several ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
            if (page !== current && page >= 0 && page < shown.length) setCurrent(page);
          }}
          style={StyleSheet.absoluteFill}
        >
          {shown.map((page, i) => (
            <View key={i} style={{ width, height }}>
              <Photo
                source={page.source}
                fallback={null}
                cachePolicy={page.cache}
                position={page.position}
                style={[styles.photo, { top: h.photo.top + dy, height: h.photo.height }]}
                testID={i === 0 ? `${testID}.photo` : undefined}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        // One photograph (21, or 05 before its others are known): no pager to size, the photo across the hero, cut
        // at its foot as the pager cuts it.
        <View style={styles.clip}>
          <Photo
            source={shown[0]?.source ?? null}
            fallback={null}
            cachePolicy={shown[0]?.cache}
            position={shown[0]?.position}
            style={[styles.photo, { top: h.photo.top + dy, height: h.photo.height }]}
            testID={`${testID}.photo`}
          />
        </View>
      )}
      <LinearGradient
        colors={[`${tokens.colors.surfacePage}00`, tokens.colors.surfacePage, tokens.colors.surfacePage]}
        locations={[0, (fade.to - fade.from) / Math.max(1, height - fadeTop), 1]}
        style={[styles.fade, { top: fadeTop }]}
        pointerEvents="none"
      />
      <BackButton
        testID={`${testID}.back`}
        variant="photo"
        diameter={h.round.size}
        glyph={{ size: h.backGlyph.size, stroke: h.backGlyph.stroke }}
        onPress={onBack}
        style={StyleSheet.flatten([
          styles.round,
          { top: h.round.top + dy, left: h.round.back, paddingRight: 2 * h.backGlyph.shift },
        ])}
      />
      {gone ? null : actions?.({ top: h.round.top + dy, size: h.round.size })}
      {several && !gone ? (
        <>
          <View style={[styles.thumbs, { top: h.thumbs.top + dy, left: h.thumbs.left }]}>
            <PhotoThumbs
              testID={`${testID}.thumbs`}
              photos={shown.map((p) => ({ source: p.thumb ?? p.source, label: p.label }))}
              current={current}
              onSelect={(i) => {
                setCurrent(i);
                scroller.current?.scrollTo({ x: i * width, animated: true });
              }}
            />
          </View>
          <View style={[styles.dots, { top: h.dots.centre - h.dots.size / 2 + dy }]} pointerEvents="none">
            <PageDots count={shown.length} current={current} testID={`${testID}.dots`} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { position: "absolute", left: 0, right: 0 },
  clip: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  round: { position: "absolute" },
  thumbs: { position: "absolute" },
  dots: { position: "absolute", left: 0, right: 0 },
});
