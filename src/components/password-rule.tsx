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
        color={ok ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)"}
      />
      <Text style={[styles.label, ok && styles.labelOk]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  label: {
    ...Club.type.bodySm,
    color: "rgba(255,255,255,0.55)",
  },
  labelOk: {
    color: "rgba(255,255,255,0.9)",
  },
});
