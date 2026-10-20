import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Armchair,
  Bell,
  Bookmark,
  Calendar,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  CloudSun,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Heart,
  Info,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Search,
  Settings,
  Share,
  Trash,
  User,
  UserPen,
  Users,
  X,
} from "lucide-react-native";
import Svg, { Circle as SvgCircle, Path } from "react-native-svg";
import { tokens } from "./tokens";

/** Line icons the club draws itself, where Lucide has none: the airline seat (side view) and a parent with a child. */
type GlyphProps = { size?: number; color?: string; strokeWidth?: number };

function Seat({ size = 24, color = tokens.colors.textPrimary, strokeWidth = 1.75 }: GlyphProps) {
  // A reclined seat seen from the side: the backrest, the cushion, the leg rest and the foot.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.2 3.5 8.6 13a2 2 0 0 0 1.94 1.5H16a1.6 1.6 0 0 1 1.52 1.1l1.48 4.4M8.9 14.4 7.5 20.5M11 18h5.2M5 3.6l.9-.3a1 1 0 0 1 1.26.68"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Family({ size = 24, color = tokens.colors.textPrimary, strokeWidth = 1.75 }: GlyphProps) {
  // An adult holding a child's hand: two heads, two bodies, the arms joined.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={8} cy={4.2} r={2} stroke={color} strokeWidth={strokeWidth} />
      <SvgCircle cx={17} cy={10.4} r={1.6} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M6 21v-6.2H4.6V9.6A2 2 0 0 1 6.6 7.6h2.8a2 2 0 0 1 2 2v1.6l3 2.2M10 21v-6.2M8 21v-5M15 21v-3.6h-.8v-2.4a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v2.4h-.8V21M17 21v-2.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlaneFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  // A plane seen from above, nose up, filled: the route's plane on the globe (13) and on a flight's line (sheet 40).
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2.1l-7.7-2.3v4.6l2.2 1.6V21l-3.5-1-3.5 1v-1.2l2.2-1.6v-4.6L3 15.9v-2.1l7.7-4.6V4c0-1.1.5-2 1.3-2Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * One line family (Lucide), the same on both platforms, at a 1.75 stroke (DESIGN.md · Iconography). The names the 3.0
 * screens use, and the 1.0 names screens still being moved to 3.0 read (`departure`, `inbox`, `explore` …).
 */
export const icons = {
  // 3.0 (component sheet 43)
  search: Search,
  "map-pin": MapPin,
  plane: Plane,
  "plane-fill": PlaneFill,
  calendar: Calendar,
  user: User,
  users: Users,
  family: Family,
  seat: Seat,
  armchair: Armchair,
  globe: Globe,
  compass: Compass,
  clipboard: ClipboardList,
  chevron: ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  x: X,
  share: Share,
  heart: Heart,
  bookmark: Bookmark,
  phone: Phone,
  bell: Bell,
  lock: Lock,
  trash: Trash,
  "user-pen": UserPen,
  check: Check,
  info: Info,
  "sun-cloud": CloudSun,
  "bar-chart": ChartNoAxesColumn,
  "file-text": FileText,
  message: MessageSquare,
  mail: Mail,
  "round-trip": ArrowLeftRight,
  alert: CircleAlert,
  settings: Settings,
  clock: Clock,
  minus: Minus,
  plus: Plus,
  eye: Eye,
  "eye-off": EyeOff,
  circle: Circle,
  "circle-check": CircleCheck,
  // 1.0 names, kept while their screens move to 3.0
  departure: PlaneTakeoff,
  arrival: PlaneLanding,
  dates: Calendar,
  passengers: Users,
  cabin: Seat,
  arrow: ArrowRight,
  clear: X,
  call: Phone,
  inbox: ClipboardList,
  profile: User,
  explore: Compass,
  warning: AlertTriangle,
  back: ChevronLeft,
  eyeOff: EyeOff,
  proposals: Plane,
} as const;

export type IconName = keyof typeof icons;
export type IconSize = 12 | 14 | 16 | 18 | 20 | 22 | 24 | 28 | 30 | 32 | 44;

export function Icon({
  name,
  size = 20,
  color = tokens.colors.textSecondary,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  strokeWidth?: number;
}) {
  const Glyph = icons[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
