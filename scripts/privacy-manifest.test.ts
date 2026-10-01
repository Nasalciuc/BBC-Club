import { describe, expect, it } from "bun:test";
import { mergeReasons, parseAccessedApis } from "./privacy-manifest";

describe("privacy-manifest", () => {
  it("parses a PrivacyInfo.xcprivacy fragment", () => {
    const xml = `<?xml version="1.0"?>
<dict>
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
</dict>`;
    expect(parseAccessedApis(xml)).toEqual([
      { category: "NSPrivacyAccessedAPICategoryUserDefaults", reasons: ["CA92.1"] },
    ]);
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
