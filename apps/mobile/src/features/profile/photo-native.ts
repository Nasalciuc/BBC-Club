import { requireOptionalNativeModule } from "expo";
import { PHOTO_SIDE } from "@bbc/shared/media/webp";

import { base64ToBytes, encodeWithin, photoPickerAvailable, photoToSend, squareCrop } from "./photo-logic";

/**
 * The one door to the photo picker and the image manipulator (brief 3.4.2, ADR-IMPL-070, D4). Their JavaScript asks
 * the runtime for its native module as it loads, and a binary without it (0.2.0, reached by an update over the air)
 * would crash right there. So nothing imports them but this file, and only through `import()` behind
 * `photoPickerReady` — a test holds the whole app to that (photo-guard.test.ts).
 */

/** Asked once: a binary has its native modules, or not, for its whole life. False — Edit profile shows no Photo row. */
export const photoPickerReady = photoPickerAvailable((name) => requireOptionalNativeModule(name));

export type PickedPhoto =
  { kind: "photo"; bytes: Uint8Array } | { kind: "cancelled" } | { kind: "failed"; stage: "picker" | "prepare" };

/**
 * The member picks a photo from their library (no camera: the build asks for none), cropped square in the system's
 * own editor; it is cropped square again here in case the platform left it a pixel off, resized to 512 × 512, saved as
 * WebP at the best quality that weighs at most 100 KB, and stripped of whatever metadata the encoder wrote. Asks no
 * permission: the system's photo picker runs outside the app and hands back only the photo chosen.
 */
export async function pickPhoto(): Promise<PickedPhoto> {
  if (!photoPickerReady) return { kind: "failed", stage: "picker" };
  let uri: string;
  try {
    const ImagePicker = await import("expo-image-picker");
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      exif: false,
      base64: false,
      allowsMultipleSelection: false,
    });
    const asset = picked.canceled ? undefined : picked.assets?.[0];
    if (!asset) return { kind: "cancelled" };
    uri = asset.uri;
  } catch {
    return { kind: "failed", stage: "picker" };
  }

  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    // The picture as the manipulator reads it (turned upright): its own size, not the picker's, decides the square.
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const context = ImageManipulator.manipulate(original);
    try {
      context.crop(squareCrop(original.width, original.height)).resize({ width: PHOTO_SIDE, height: PHOTO_SIDE });
      const square = await context.renderAsync();
      try {
        const encoded = await encodeWithin(async (quality) => {
          const saved = await square.saveAsync({ format: SaveFormat.WEBP, compress: quality, base64: true });
          try {
            return base64ToBytes(saved.base64 ?? "");
          } finally {
            await removeCopy(saved.uri);
          }
        });
        if (!encoded.ok) return { kind: "failed", stage: "prepare" };
        const sent = photoToSend(encoded.bytes);
        return sent.ok ? { kind: "photo", bytes: sent.bytes } : { kind: "failed", stage: "prepare" };
      } finally {
        square.release();
      }
    } finally {
      context.release();
      original.release();
    }
  } catch {
    return { kind: "failed", stage: "prepare" };
  }
}

/**
 * Each attempt's `saveAsync` also writes the WebP to the app's cache: a copy of the member's photo the server's delete
 * could never reach. It goes as soon as its bytes are read. A copy that cannot be deleted is left to the cache, which
 * the system clears; it never fails the photo.
 */
async function removeCopy(uri: string): Promise<void> {
  try {
    const { File } = await import("expo-file-system");
    const copy = new File(uri);
    if (copy.exists) copy.delete();
  } catch {
    // left to the system's cache
  }
}
