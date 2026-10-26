import { describe, expect, it } from "bun:test";
import { mergeReasons, parseAccessedApis } from "./privacy-manifest";

function plist(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${inner}
</plist>`;
}

describe("privacy-manifest", () => {
  it("parses a PrivacyInfo.xcprivacy fragment", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>`);
    expect(parseAccessedApis(xml)).toEqual([
      { category: "NSPrivacyAccessedAPICategoryUserDefaults", reasons: ["CA92.1"] },
    ]);
  });

  it("parses reversed keys with a comment between them", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
      <!-- Expo / Apple key order is not guaranteed -->
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    </dict>
  </array>
</dict>`);
    expect(parseAccessedApis(xml)).toEqual([
      { category: "NSPrivacyAccessedAPICategoryUserDefaults", reasons: ["CA92.1"] },
    ]);
  });

  it("returns no entries when NSPrivacyAccessedAPITypes is absent", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyTracking</key>
  <false/>
</dict>`);
    expect(parseAccessedApis(xml)).toEqual([]);
  });

  it("throws on a truncated file and names it", () => {
    expect(() => parseAccessedApis("<plist><dict><key>NSPrivacy", "ios/PrivacyInfo.xcprivacy")).toThrow(
      /ios\/PrivacyInfo\.xcprivacy: not a plist dictionary/,
    );
  });

  it("throws when an entry has no reasons", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    </dict>
  </array>
</dict>`);
    expect(() => parseAccessedApis(xml, "bad.xcprivacy")).toThrow(
      /bad\.xcprivacy: entry 0 is missing NSPrivacyAccessedAPIType or its reasons/,
    );
  });

  it("throws when an entry uses an unknown element", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dikt>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dikt>
  </array>
</dict>`);
    expect(() => parseAccessedApis(xml, "typo.xcprivacy")).toThrow(/typo\.xcprivacy: unknown plist element <dikt>/);
  });

  it("throws when a reason uses an unknown element", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <strng>CA92.1</strng>
      </array>
    </dict>
  </array>
</dict>`);
    expect(() => parseAccessedApis(xml, "typo.xcprivacy")).toThrow(/typo\.xcprivacy: unknown plist element <strng>/);
  });

  it("throws when an entry's reasons array is empty", () => {
    const xml = plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array></array>
    </dict>
  </array>
</dict>`);
    expect(() => parseAccessedApis(xml, "empty.xcprivacy")).toThrow(
      /empty\.xcprivacy: entry 0 has an empty reasons list/,
    );
  });

  it("unions reasons per category", () => {
    expect(
      mergeReasons([
        { category: "NSPrivacyAccessedAPICategoryFileTimestamp", reasons: ["C617.1"] },
        { category: "NSPrivacyAccessedAPICategoryFileTimestamp", reasons: ["0A2A.1", "C617.1"] },
        { category: "NSPrivacyAccessedAPICategoryUserDefaults", reasons: ["CA92.1"] },
      ]),
    ).toEqual([
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
        NSPrivacyAccessedAPITypeReasons: ["0A2A.1", "C617.1"],
      },
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
        NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
      },
    ]);
  });
});
