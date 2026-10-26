import { ArrowRight, Check, ChevronLeft, Circle, Eye, EyeOff } from "lucide-react-native";

import { Club } from "@/constants/club";

/**
 * The entry's icons, exactly as 1.0 draws them: Lucide's line glyphs at a 1.5 stroke. Taken here, not from `@bbc/ui`'s
 * `Icon`, so the club's icon set can move to 3.0 (ADR-IMPL-055) without touching the entry (ADR-IMPL-047).
 */
const GLYPHS = {
  arrow: ArrowRight,
  back: ChevronLeft,
  check: Check,
  circle: Circle,
  eye: Eye,
  eyeOff: EyeOff,
} as const;

export type ClubIconName = keyof typeof GLYPHS;

export function ClubIcon({
  name,
  size = 24,
  color = Club.colors.textOnDark,
}: {
  name: ClubIconName;
  size?: number;
  color?: string;
}) {
  const Glyph = GLYPHS[name];
  return <Glyph size={size} color={color} strokeWidth={1.5} />;
}
