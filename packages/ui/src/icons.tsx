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
import {
  CABIN_BUSINESS,
  CABIN_FIRST,
  CHECK_MARK,
  FAMILY,
  TAB_EXPLORE,
  TAB_PROFILE,
  TAB_REQUESTS,
  WEATHER_CLOUD,
  WEATHER_SUN,
  type ArtPath,
} from "./art-paths";
import { tokens } from "./tokens";

type GlyphProps = { size?: number; color?: string; strokeWidth?: number };

/** The line weight of the traced line glyphs (the cabins, the family) in their own crop pixels: 3 px. */
const ART_LINE = 3;

function box(art: ArtPath): [number, number, number, number] {
  const [x = 0, y = 0, w = 1, h = 1] = art.viewBox.split(" ").map(Number);
  return [x, y, w, h];
}

/**
 * A glyph traced from the design's pixels (art-paths.ts) at the size a screen measures it: `height` pt tall, its own
 * proportions, its own line weight — the cabins of 01, the family, the active tabs.
 */
export function ArtGlyph({ art, height, color }: { art: ArtPath; height: number; color: string }) {
  const [, , w, h] = box(art);
  return (
    <Svg width={(height * w) / h} height={height} viewBox={art.viewBox}>
      <Path d={art.d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * A traced line glyph used as an icon of the set: fitted into a `size` box and centred. At another size than the
 * image's a traced outline thins or thickens with it, so the outline is widened by a stroke of its own colour until
 * the line weighs `strokeWidth` pt like the Lucide icons beside it (never thinner than the glyph's own line).
 */
function traced(art: ArtPath) {
  return function TracedIcon({ size = 24, color = tokens.colors.textPrimary, strokeWidth = 1.75 }: GlyphProps) {
    const [x, y, w, h] = box(art);
    const side = Math.max(w, h);
    const scale = size / side;
    const extra = Math.max(0, strokeWidth - ART_LINE * scale) / scale;
    const m = extra / 2;
    const vb = `${x - (side - w) / 2 - m} ${y - (side - h) / 2 - m} ${side + extra} ${side + extra}`;
    return (
      <Svg width={size} height={size} viewBox={vb}>
        <Path
          d={art.d}
          fill={color}
          fillRule="evenodd"
          stroke={extra > 0 ? color : "none"}
          strokeWidth={extra}
          strokeLinejoin="round"
        />
      </Svg>
    );
  };
}

/** Business's reclining seat and First's armchair (01) — never one for the other (the handoff keeps them distinct). */
const Seat = traced(CABIN_BUSINESS);
const FirstSeat = traced(CABIN_FIRST);
/** An adult with a child (01, `Travelling with children?`) — not `users`, which is two adults. */
const Family = traced(FAMILY);

/** The weather mark of 05: the navy cloud and the sun, as drawn (its sun is the only yellow, `art-sun`). */
export function WeatherMark({ height }: { height: number }) {
  const [, , w, h] = box(WEATHER_CLOUD);
  return (
    <Svg width={(height * w) / h} height={height} viewBox={WEATHER_CLOUD.viewBox}>
      <Path d={WEATHER_SUN.d} fill={tokens.colors.artSun} fillRule="evenodd" />
      <Path d={WEATHER_CLOUD.d} fill={tokens.colors.textPrimary} fillRule="evenodd" />
    </Svg>
  );
}

/** The white check of `Request received.` (08), traced; the navy disc and its white ring are the caller's. */
export function CheckMark({ height, color }: { height: number; color: string }) {
  return <ArtGlyph art={CHECK_MARK} height={height} color={color} />;
}

/** The active tabs' filled glyphs (05, 11, 12), traced: a filled navy compass, clipboard and person. */
export const TAB_ACTIVE = { explore: TAB_EXPLORE, requests: TAB_REQUESTS, profile: TAB_PROFILE } as const;

/** Lucide's handset (the pinned `phone`, sheet 43), filled: 11 and 30–33 draw it solid in its circle and on the pill. */
const PHONE_D =
  "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384";

function PhoneFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PHONE_D} fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}

/** Lucide's `info` filled (33): the disc in the given colour, the `i` cut out in white. */
function InfoFill({ size = 24, color = tokens.colors.infoMark }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={12} cy={12} r={10.6} fill={color} />
      <Path d="M12 16.4v-4.6" stroke={tokens.colors.textOnPhoto} strokeWidth={2.3} strokeLinecap="round" />
      <Path d="M12 7.8h.01" stroke={tokens.colors.textOnPhoto} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** 12, 36: the home airport's plane, solid, nose to the right. */
function PlaneRightFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2.1l-7.7-2.3v4.6l2.2 1.6V21l-3.5-1-3.5 1v-1.2l2.2-1.6v-4.6L3 15.9v-2.1l7.7-4.6V4c0-1.1.5-2 1.3-2Z"
        fill={color}
        transform="rotate(90 12 12)"
      />
    </Svg>
  );
}

/** 12, 36: the travelers, two people solid (Lucide `users`, filled). */
function UsersFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={16.4} cy={7.6} r={3.4} fill={color} />
      <Path d="M17.2 13.6h.6a4.6 4.6 0 0 1 4.6 4.6V21h-4.3v-2.8a6.6 6.6 0 0 0-2.4-5.1 4 4 0 0 1 1.5-.5Z" fill={color} />
      <SvgCircle cx={9} cy={7.2} r={4.1} fill={color} />
      <Path d="M5.6 13.2h6.8a4.6 4.6 0 0 1 4.6 4.6V21H1v-3.2a4.6 4.6 0 0 1 4.6-4.6Z" fill={color} />
    </Svg>
  );
}

/** 12, 34: the password's lock, solid, its keyhole cut out (Lucide `lock`, filled). */
function LockFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path
        d="M5.5 10.5h13A2.5 2.5 0 0 1 21 13v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19.5V13a2.5 2.5 0 0 1 2.5-2.5Z"
        fill={color}
      />
      <SvgCircle cx={12} cy={15.6} r={1.6} fill={tokens.colors.surfaceCard} />
      <Path d="M12 16.4v2.2" stroke={tokens.colors.surfaceCard} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** 12: `Edit profile`'s mark, a person solid with a pen (Lucide `user-pen`, filled). */
function UserPenFill({ size = 24, color = tokens.colors.textPrimary }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={10} cy={7} r={4.4} fill={color} />
      <Path d="M7 14h5.4l-1.9 1.9a3 3 0 0 0-.8 1.3L8.9 21H2.6v-2.4A4.6 4.6 0 0 1 7 14Z" fill={color} />
      <Path
        d="M21.4 16.6a1.4 1.4 0 0 0-2-2l-4.6 4.6a1.6 1.6 0 0 0-.4.7l-.7 2.4a.4.4 0 0 0 .5.5l2.4-.7a1.6 1.6 0 0 0 .7-.4Z"
        fill={color}
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
  "seat-first": FirstSeat,
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
  "phone-fill": PhoneFill,
  "plane-right-fill": PlaneRightFill,
  "users-fill": UsersFill,
  "lock-fill": LockFill,
  "user-pen-fill": UserPenFill,
  "info-fill": InfoFill,
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
/** Any size: the screens are measured to the half point (ADR-IMPL-056). */
export type IconSize = number;

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
