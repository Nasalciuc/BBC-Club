import type { ImageSourcePropType } from "react-native";
import { tokens } from "../tokens";

/** Twenty markets we serve. Missing codes fall back to a neutral rectangle. */
const FLAGS: Record<string, ImageSourcePropType> = {};

/** 1×1 grey PNG (base64) — stand-in until country sprites ship. */
const NEUTRAL: ImageSourcePropType = {
  uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAOCAMAAADw1H8/AAAABlBMVEXc3Nz////3QJ5cAAAAGElEQVQI12NgYGBgYGBgYGBgYGBgYAAABvwAAfW1VJYAAAAASUVORK5CYII=",
};

export function flagSource(countryCode: string): ImageSourcePropType {
  return FLAGS[countryCode.toUpperCase()] ?? NEUTRAL;
}

/** Exposed so gallery can assert the fallback exists without inventing hex. */
export const FLAG_FALLBACK_TINT = tokens.colors.borderDefault;
