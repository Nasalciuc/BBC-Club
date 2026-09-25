import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Icon, tokens, rn } from "@bbc/ui";

import { CLUB_PHONE_COUNTRIES, callingCodeLabel, type CountryCode } from "@/lib/phone";

type Props = {
  /** National digits (or full E.164 if the member pastes +…). */
  value: string;
  country: CountryCode;
  onChangeText: (value: string) => void;
  onCountryChange: (country: CountryCode) => void;
  /** Input testID — keep existing Maestro ids (profile.phone.input / request.phone). */
  testID: string;
  countryTestID?: string;
  empty?: boolean;
  label?: string;
};

/**
 * Prefix (+country) + national number. Country picker is a short club list.
 * Uses BottomSheetTextInput so the keyboard works inside gorhom sheets.
 */
export function PhoneField({
  value,
  country,
  onChangeText,
  onCountryChange,
  testID,
  countryTestID = "phone.country",
  empty,
  label = "PHONE",
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, empty && styles.rowEmpty]}>
        <Pressable
          testID={countryTestID}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${callingCodeLabel(country)}`}
          onPress={() => setPickerOpen(true)}
          style={styles.prefix}
        >
          <Text style={styles.prefixText}>{callingCodeLabel(country)}</Text>
          <Icon name="chevron" size={16} color={tokens.colors.textSecondary} />
        </Pressable>
        <BottomSheetTextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          style={styles.input}
          placeholderTextColor={tokens.colors.textTertiary}
        />
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            testID="phone.country.dismiss"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerOpen(false)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Country code</Text>
            <FlatList
              data={[...CLUB_PHONE_COUNTRIES]}
              keyExtractor={(c) => c}
              renderItem={({ item }) => {
                const selected = item === country;
                return (
                  <Pressable
                    testID={`phone.country.${item}`}
                    accessibilityRole="button"
                    onPress={() => {
                      onCountryChange(item);
                      setPickerOpen(false);
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={styles.optionCode}>{item}</Text>
                    <Text style={styles.optionDial}>{callingCodeLabel(item)}</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.xxs },
  label: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
    overflow: "hidden",
  },
  rowEmpty: { borderColor: tokens.colors.primary },
  prefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xxs,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRightWidth: 1,
    borderRightColor: tokens.colors.borderDefault,
    minHeight: 56,
  },
  prefixText: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  input: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: tokens.colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "50%",
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.xxl,
  },
  sheetTitle: {
    ...rn(tokens.type.title),
    color: tokens.colors.textPrimary,
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.sm,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    minHeight: 44,
  },
  optionSelected: { backgroundColor: tokens.colors.surfaceCard },
  optionCode: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  optionDial: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
});
