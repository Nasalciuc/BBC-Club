# iOS privacy manifest

The App Store does not reliably parse `PrivacyInfo.xcprivacy` files shipped inside static CocoaPods, including Expo SDK packages. See [Expo: Privacy manifests](https://docs.expo.dev/guides/apple-privacy/). This app therefore declares the **union** of every required-reason API used by the iOS production binary in `apps/mobile/app.json` → `ios.privacyManifests`.

`scripts/privacy-manifest.ts` rebuilds that block:

1. Walk the production iOS dependency tree of `@bbc/mobile` (skips `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, `expo-dev-menu-interface`).
2. Copy `NSPrivacyAccessedAPITypes` from every `PrivacyInfo.xcprivacy` in those packages.
3. Add reviewed no-manifest hits from `apps/mobile/privacy-supplement.json`.
4. Write one entry per category, reasons sorted and de-duplicated. `NSPrivacyTracking` is `false`.

`--check` (wired in `validate` and `validate:quick`) fails when `app.json` is stale. After the first TestFlight upload, any reason Apple emails as missing goes into the supplement file and the script is re-run.

There is no Mac on this machine. Xcode’s Privacy Report is the confirmation step when a Mac exists.

## Union written today

| Category       | Reasons                |
| -------------- | ---------------------- |
| FileTimestamp  | C617.1, 0A2A.1, 3B52.1 |
| UserDefaults   | CA92.1                 |
| SystemBootTime | 35F9.1                 |
| DiskSpace      | E174.1, 85F4.1         |

## Dependency table

| Dependency                                                                                                                                                                                       | Own manifest? | Reasons                                                          | Source                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| expo-application                                                                                                                                                                                 | yes           | FileTimestamp C617.1                                             | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| expo-constants                                                                                                                                                                                   | yes           | UserDefaults CA92.1                                              | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| expo-device                                                                                                                                                                                      | yes           | SystemBootTime 35F9.1                                            | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| expo-file-system                                                                                                                                                                                 | yes           | FileTimestamp 0A2A.1, 3B52.1; DiskSpace E174.1, 85F4.1           | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| expo-notifications                                                                                                                                                                               | yes           | UserDefaults CA92.1                                              | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| expo-system-ui                                                                                                                                                                                   | yes           | UserDefaults CA92.1                                              | copied from `ios/PrivacyInfo.xcprivacy`                                           |
| react-native                                                                                                                                                                                     | yes (6 files) | FileTimestamp C617.1; UserDefaults CA92.1; SystemBootTime 35F9.1 | copied from `React/Resources`, `cxxreact`, `react/timing`, boost, glog, RCT-Folly |
| expo-updates                                                                                                                                                                                     | no            | UserDefaults CA92.1                                              | scan `ios/EXUpdates/UpdatesConfigOverride.swift`                                  |
| expo-eas-client                                                                                                                                                                                  | no            | UserDefaults CA92.1                                              | scan `ios/EASClient/EASClientID.swift`                                            |
| expo-network                                                                                                                                                                                     | no            | none                                                             | **Keep.** Better Auth imports it dynamically — the #46 fix. Do not remove.        |
| expo-secure-store                                                                                                                                                                                | no            | none                                                             | Keychain (`SecItem*`) only — not a required-reason API                            |
| expo-crypto                                                                                                                                                                                      | no            | none                                                             | scanned iOS sources                                                               |
| react-native-mmkv                                                                                                                                                                                | no            | none                                                             | scanned iOS sources                                                               |
| expo-router, expo-splash-screen, expo-font, expo-image, expo-linking, expo-blur, expo-glass-effect, expo-symbols, expo-web-browser, netinfo, screens, safe-area-context, nitro-modules, @expo/ui | no            | none                                                             | native pods with no required-reason APIs in the static scan                       |

`expo-local-authentication` was removed in this PR (zero JS imports) so the binary does not link Face ID and we do not add `NSFaceIDUsageDescription`.
