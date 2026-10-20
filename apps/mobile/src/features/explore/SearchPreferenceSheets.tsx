import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CabinCard, ModalSheet, type ModalSheetHandle, Stepper, tokens, rn } from "@bbc/ui";

import { type Cabin, type Passengers, travelersLabel, withAdults } from "./travel-preferences";

/**
 * The cabin and traveler pickers behind Home's preference chips (89:387). They change this search only — the
 * profile's defaults stay where the member set them (Profile → Edit profile). Dates open the shared DatesPage; the
 * request sheet opens the same travelers sheet over itself (06).
 */

export type CabinSheetHandle = { present: (current: Cabin) => void; dismiss: () => void };

export const SearchCabinSheet = forwardRef<CabinSheetHandle, { onPick: (cabin: Cabin) => void }>(
  function SearchCabinSheet({ onPick }, ref) {
    const modalRef = useRef<ModalSheetHandle>(null);
    const insets = useSafeAreaInsets();
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
      // No image of its own: onboarding's two cabin cards side by side (01), as Profile's cabin sheet.
      <ModalSheet
        ref={modalRef}
        title="Cabin"
        closeTestID="explore.cabin.close"
        testID="explore.cabin.sheet"
        insets={insets}
      >
        <Text style={styles.body}>For this search. Your usual cabin stays in your profile.</Text>
        <View style={styles.cabins}>
          <CabinCard
            testID="explore.cabin.business"
            cabin="business"
            title="Business"
            line={"More space,\na better journey"}
            selected={cabin === "business"}
            onPress={() => pick("business")}
          />
          <CabinCard
            testID="explore.cabin.first"
            cabin="first"
            title="First"
            line={"The highest\nlevel of comfort"}
            selected={cabin === "first"}
            onPress={() => pick("first")}
          />
        </View>
      </ModalSheet>
    );
  },
);

export type TravelersSheetHandle = { present: (current: Passengers) => void; dismiss: () => void };

type TravelersProps = {
  onPick: (passengers: Passengers) => void;
  /** `explore.travelers` for a search's chip; `request.travelers` over the request sheet (06). */
  testIDPrefix?: string;
  /** Over the request sheet, it stacks on it rather than replacing it. */
  stackBehavior?: "push";
};

export const SearchTravelersSheet = forwardRef<TravelersSheetHandle, TravelersProps>(function SearchTravelersSheet(
  { onPick, testIDPrefix = "explore.travelers", stackBehavior },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
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
    // No Figma frame of its own: Profile's travelers sheet (238:4842) is the model.
    <ModalSheet
      ref={modalRef}
      title="Travelers"
      closeTestID={`${testIDPrefix}.close`}
      testID={`${testIDPrefix}.sheet`}
      insets={insets}
      stackBehavior={stackBehavior}
      footer={
        <Button
          testID={`${testIDPrefix}.use`}
          label={`Use ${travelersLabel(party)}`}
          variant="primary"
          onPress={() => {
            onPick(party);
            modalRef.current?.dismiss();
          }}
        />
      }
    >
      <Stepper
        testID={`${testIDPrefix}.adults`}
        label="Adults"
        value={party.adult}
        onChange={(adult) => setParty((p) => withAdults(p, adult))}
        min={1}
        max={9}
      />
      <Text style={styles.caption}>For children or larger parties, add a note to your request.</Text>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  body: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  cabins: { flexDirection: "row", gap: 7.7 },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
});
