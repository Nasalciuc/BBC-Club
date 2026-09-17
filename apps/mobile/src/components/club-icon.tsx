import { Icon, type IconName, type IconSize } from "@bbc/ui/icons";

import { Club } from "@/constants/club";

/** Kept so the entry screens keep their imports. New code imports `Icon` from @bbc/ui/icons. */
export function ClubIcon({
  name,
  size = 24,
  color = Club.colors.textOnDark,
}: {
  name: IconName;
  size?: IconSize | number;
  color?: string;
}) {
  return <Icon name={name} size={size as IconSize} color={color} />;
}

export type { IconName };
