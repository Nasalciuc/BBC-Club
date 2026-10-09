import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Chip, CloseButton, Stepper, tokens, rn } from "@bbc/ui";

import { type Cabin, type Passengers, travelersLabel, withAdults } from "./travel-preferences";

/**
 * The cabin and traveler pickers behind Home's preference chips (89:387). They change this search only — the
 * profile's defaults stay where the member set them (Profile → Edit profile). Dates open the shared DatesSheet.
 */

export type CabinSheetHandle = { present: (current: Cabin) => void; dismiss: () => void };

export const SearchCabinSheet = forwardRef<CabinSheetHandle, { onPick: (cabin: Cabin) => void }>(
  function SearchCabinSheet({ onPick }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);
    const [cabin, setCabin] = useState<Cabin>("business");

    useImperativeHandle(ref, () => ({
      present(current) {
        setCabin(current);
        modalRef.current?.present();
      },
      dismiss() {
        modalRef.current?.dismiss();
      },
    }));

    function pick(next: Cabin) {
      setCabin(next);
      onPick(next);
      modalRef.current?.dismiss();
    }

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.content} testID="explore.cabin.sheet">
          <View style={styles.header}>
            <Text style={styles.title}>Cabin</Text>
            <CloseButton testID="explore.cabin.close" onPress={() => modalRef.current?.dismiss()} />
          </View>
          <Text style={styles.body}>For this search. Your usual cabin stays in your profile.</Text>
          <View style={styles.chips}>
            <Chip
              testID="explore.cabin.business"
              label="Business"
              selected={cabin === "business"}
              onPress={() => pick("business")}
            />
            <Chip
              testID="explore.cabin.first"
              label="First"
              selected={cabin === "first"}
              onPress={() => pick("first")}
            />
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

export type TravelersSheetHandle = { present: (current: Passengers) => void; dismiss: () => void };

export const SearchTravelersSheet = forwardRef<TravelersSheetHandle, { onPick: (passengers: Passengers) => void }>(
  function SearchTravelersSheet({ onPick }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);
    // Adults only here: children and infants the search already carries (the profile's) stay in the party.
    const [party, setParty] = useState<Passengers>(() => withAdults(undefined, 1));

    useImperativeHandle(ref, () => ({
      present(current) {
        setParty(withAdults(current, current.adult));
        modalRef.current?.present();
      },
      dismiss() {
        modalRef.current?.dismiss();
      },
    }));

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={styles.content} testID="explore.travelers.sheet">
          <View style={styles.header}>
            <Text style={styles.title}>Travelers</Text>
            <CloseButton testID="explore.travelers.close" onPress={() => modalRef.current?.dismiss()} />
          </View>
          <Stepper
            testID="explore.travelers.adults"
            label="Adults"
            value={party.adult}
            onChange={(adult) => setParty((p) => withAdults(p, adult))}
            min={1}
            max={9}
          />
          <Text style={styles.caption}>For children or larger parties, add a note to your request.</Text>
          <Button
            testID="explore.travelers.use"
            label={`Use ${travelersLabel(party)}`}
            variant="primary"
            shape="pill"
            onPress={() => {
              onPick(party);
              modalRef.current?.dismiss();
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  chips: { flexDirection: "row", gap: tokens.space.xs },
});
