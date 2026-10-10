import {
  AlertTriangle,
  ArrowRight,
  Armchair,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Eye,
  EyeOff,
  Globe,
  Inbox,
  Minus,
  Phone,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Search,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react-native";
import { tokens } from "./tokens";

/** One icon family, identical on both platforms. Stroke 1.5 matches our 1-pt hairlines. */
export const icons = {
  search: Search,
  settings: Settings,
  departure: PlaneTakeoff,
  arrival: PlaneLanding,
  plane: Plane,
  dates: Calendar,
  passengers: Users,
  cabin: Armchair,
  arrow: ArrowRight,
  clear: X,
  chevron: ChevronRight,
  call: Phone,
  inbox: Inbox,
  profile: UserCircle,
  explore: Globe,
  check: Check,
  warning: AlertTriangle,
  eye: Eye,
  "eye-off": EyeOff,
  minus: Minus,
  plus: Plus,
  /** ClubIcon compat — entry screens and password rules. */
  back: ChevronLeft,
  eyeOff: EyeOff,
  circle: Circle,
  /** Timeline step done (Figma 46:114). */
  "circle-check": CircleCheck,
  proposals: Plane,
} as const;

export type IconName = keyof typeof icons;
export type IconSize = 14 | 16 | 18 | 20 | 24;

export function Icon({
  name,
  size = 20,
  color = tokens.colors.textSecondary,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
}) {
  const Glyph = icons[name];
  return <Glyph size={size} color={color} strokeWidth={1.5} />;
}
