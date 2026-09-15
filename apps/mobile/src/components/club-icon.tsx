import { SymbolView } from "expo-symbols";

import { Club } from "@/constants/club";

const icons = {
  back: {
    ios: "chevron.left",
    android: "chevron_left",
    web: "chevron_left",
  },
  arrow: {
    ios: "arrow.right",
    android: "arrow_forward",
    web: "arrow_forward",
  },
  eye: {
    ios: "eye",
    android: "visibility",
    web: "visibility",
  },
  eyeOff: {
    ios: "eye.slash",
    android: "visibility_off",
    web: "visibility_off",
  },
  check: {
    ios: "checkmark.circle.fill",
    android: "check_circle",
    web: "check_circle",
  },
  circle: {
    ios: "circle",
    android: "radio_button_unchecked",
    web: "radio_button_unchecked",
  },
  proposals: {
    ios: "airplane",
    android: "flight",
    web: "flight",
  },
  inbox: {
    ios: "tray",
    android: "inbox",
    web: "inbox",
  },
  profile: {
    ios: "person",
    android: "person",
    web: "person",
  },
  chevron: {
    ios: "chevron.right",
    android: "chevron_right",
    web: "chevron_right",
  },
} as const;

type Props = {
  name: keyof typeof icons;
  size?: number;
  color?: string;
};

export function ClubIcon({ name, size = 24, color = Club.colors.textOnDark }: Props) {
  return <SymbolView name={icons[name]} size={size} tintColor={color} />;
}
