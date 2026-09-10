import { StyleSheet, Text, View } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Props = {
  ok: boolean;
  label: string;
};

export function PasswordRule({ ok, label }: Props) {
  return (
    <View style={styles.row}>
      <ClubIcon
        name={ok ? "check" : "circle"}
        size={18}
        color={ok ? Club.colors.textOnDark : Club.colors.textOnDarkMuted}
      />
      <Text style={[styles.label, ok && styles.labelOk]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Club.space.sm,
  },
  label: {
    ...Club.type.bodySm,
    color: Club.colors.textOnDarkMuted,
  },
  labelOk: {
    color: Club.colors.textOnDark,
  },
});
