import * as Crypto from "expo-crypto";

/** Hermes has no Web `crypto`. SDK 57 `expo-crypto` `randomUUID` is sync. */
export function newId(): string {
  return Crypto.randomUUID();
}
