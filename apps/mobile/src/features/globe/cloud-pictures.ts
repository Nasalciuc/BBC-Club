/**
 * The clouds' pictures (`scripts/globe-clouds.py`), by the layer that draws each (cloud-drift.ts). Bundled with the
 * app: on the phone Metro gives each a number that @rnmapbox/maps resolves; on the web an object with its `uri`.
 */
import aNorth from "@/assets/images/club/globe/clouds-a-north.webp";
import aSouth from "@/assets/images/club/globe/clouds-a-south.webp";
import aTropics from "@/assets/images/club/globe/clouds-a-tropics.webp";
import bNorth from "@/assets/images/club/globe/clouds-b-north.webp";
import bSouth from "@/assets/images/club/globe/clouds-b-south.webp";
import bTropics from "@/assets/images/club/globe/clouds-b-tropics.webp";

import type { CloudLayer } from "./cloud-drift";

export const CLOUD_PICTURES: Readonly<Record<CloudLayer["id"], number>> = {
  "clouds-a-north": aNorth,
  "clouds-a-tropics": aTropics,
  "clouds-a-south": aSouth,
  "clouds-b-north": bNorth,
  "clouds-b-tropics": bTropics,
  "clouds-b-south": bSouth,
};

/** A picture's address on the web, where Metro gives a bundled image as `{ uri, width, height }`. */
export function cloudPictureUrl(id: CloudLayer["id"]): string {
  return (CLOUD_PICTURES[id] as unknown as { uri: string }).uri;
}
