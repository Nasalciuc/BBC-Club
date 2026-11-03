/**
 * The clouds' pictures (`scripts/globe-clouds.py`), by the layer that draws each (cloud-drift.ts). Bundled with the
 * app: on the phone Metro gives each a number, resolved here to its address; on the web an object with its `uri`.
 */
import { Image } from "react-native";

import aNorth from "@/assets/images/club/globe/clouds-a-north.webp";
import aSouth from "@/assets/images/club/globe/clouds-a-south.webp";
import aTropics from "@/assets/images/club/globe/clouds-a-tropics.webp";
import bNorth from "@/assets/images/club/globe/clouds-b-north.webp";
import bSouth from "@/assets/images/club/globe/clouds-b-south.webp";
import bTropics from "@/assets/images/club/globe/clouds-b-tropics.webp";

import { CLOUD_LAYER_IDS, type CloudLayer, mapReadableUrl } from "./cloud-drift";

export const CLOUD_PICTURES: Readonly<Record<CloudLayer["id"], number>> = {
  "clouds-a-north": aNorth,
  "clouds-a-tropics": aTropics,
  "clouds-a-south": aSouth,
  "clouds-b-north": bNorth,
  "clouds-b-tropics": bTropics,
  "clouds-b-south": bSouth,
};

/**
 * The pictures' addresses on the phone, or null where any of them has none the map can load (`mapReadableUrl`: an
 * Android release build's own pictures): then the globe goes without clouds rather than crash, both moments or none,
 * since `a` and `b` share the sky between them.
 */
export function phoneCloudUrls(): Readonly<Record<CloudLayer["id"], string>> | null {
  const urls = CLOUD_LAYER_IDS.map((id) => [id, mapReadableUrl(Image.resolveAssetSource(CLOUD_PICTURES[id])?.uri)]);
  if (urls.some(([, url]) => url === null)) return null;
  return Object.fromEntries(urls) as Record<CloudLayer["id"], string>;
}

/** A picture's address on the web, where Metro gives a bundled image as `{ uri, width, height }`. */
export function cloudPictureUrl(id: CloudLayer["id"]): string {
  return (CLOUD_PICTURES[id] as unknown as { uri: string }).uri;
}
