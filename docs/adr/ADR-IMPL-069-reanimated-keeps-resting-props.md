# ADR-IMPL-069 — Reanimated keeps a view's last animated props; parity traces Explore's sheet

Status: proposed · Date: 2026-10-25 · Scope: `apps/mobile/package.json` (`reanimated.staticFeatureFlags`,
`expo.autolinking.ios.buildFromSource`), its test `apps/mobile/src/lib/reanimated-flags.test.ts`, `design/motion.md`
(resting styles), HomeSheet's `trace` (`packages/ui/src/layout`), `apps/mobile/e2e/run-parity-ci.sh`. Needs a new native
build on iOS and Android.

**Context.**

- **The symptom.** Parity on Android lost Explore's sheet at random: steps 13 (first arrival on Explore) and 31 (back
  from Requests) showed the greeting, the globe and the tab bar, with no search bar and no offers. The same code later
  passed unchanged. CI's emulator sets `transition_animation_scale=0`, which turns on Reanimated's reduced motion.
- **The reading.** What follows comes from reading the installed packages (Reanimated 4.5.1, `@gorhom/bottom-sheet`
  5.2.14). It was not reproduced on a device.
  - gorhom draws the whole sheet inside one `Animated.View` (`BottomSheetBody`). Its first frame is transparent on
    Android and a window height down.
  - React's props for an animated style are its first frame (`PropsFilter.tsx`). Reanimated keeps the live props in a
    registry, and its commit hook puts them back on every React commit.
  - With `FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS` on (the default), a 500 ms JS poll hands React the props of views
    settled 1–2 s and erases the registry's props older than 2 s. 4.5.1 erases first and collects after
    (`AnimatedPropsRegistry.cpp`), so a poll that misses the window erases props React never received. The next React
    commit would then draw the first frame while gorhom holds the sheet at rest. A snap to the stop gorhom holds is
    skipped, so the focus re-snap cannot redraw it.
  - Reduced motion lands every snap in its first frame. Whether that raises the odds is not known.
- **What a run can show.** Every build that carries the trace also has the sync off (Decision 1), and with it off the
  erase the reading blames never runs: Reanimated stamps a view's props and hands the view to its settled-props
  collector only with the flag on (`AnimatedPropsRegistry.cpp`, `AnimatedComponent.tsx`), so a view's props leave the
  registry only when it unmounts. In these builds:
  - a green run shows the committed transform where gorhom holds the sheet in that run; it does not show the race gone;
  - a red run that loses the sheet again is a failed fix, whatever its trace says. `lost` (gorhom holds the sheet
    open; the committed transform puts it a window height down) means the first frame came back some other way, so
    the reading is not the cause: re-open this record. `closed` means gorhom itself closed the sheet. `drawn` means
    the loss is below the committed tree (the opacity, or the native views);
  - each line ends with `sync=`, the flag as the native build was compiled (`getStaticFeatureFlag`). `sync=on` in one
    of these builds means the flag did not reach it.

  No parity outcome here confirms the reading. That would take a traced build with the sync on (a throwaway branch
  with the flag true, its flag test red as it should be, run with `attempts`) failing with `lost`, beside green runs
  with it off. None is planned: the reading stays unconfirmed, and only parity staying green over time supports it.

**Decision.**

1. **The settled-props sync is off.** `FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS: false` under
   `reanimated.staticFeatureFlags` in `apps/mobile/package.json`. Reanimated's Gradle (`build.gradle.kts`) and CocoaPods
   (`reanimated_utils.rb`) scripts read it at build time. The registry then keeps a view's last props for its life, and
   every React commit re-applies them. `reanimated-flags.test.ts` pins the flag and the Reanimated version it was decided
   for.
2. **Reanimated is built from source on iOS.** Precompiled modules are on by default: SDK 57's prebuild Podfile
   (`expo/template.tgz`) sets `EXPO_USE_PRECOMPILED_MODULES` to `1` unless it is set otherwise, and EAS Build may
   export it. Reanimated then comes as Expo's XCFramework whenever a tarball resolves (a local build, or a download
   from `EXPO_PRECOMPILED_MODULES_BASE_URL`). That XCFramework is compiled with the sync on and never reads the app's
   `package.json` (`expo-modules-autolinking`'s `external-configs/ios/react-native-reanimated/spm.config.json`). So
   `apps/mobile/package.json` also sets `expo.autolinking.ios.buildFromSource: ["react-native-reanimated"]`, which
   decides before any variable or tarball is looked at (`precompiled_modules.rb`, `build_from_source?`); RNWorklets
   follows it to source. `reanimated-flags.test.ts` runs the autolinking command `use_expo_modules!` runs and fails if
   the entry no longer reaches it. The entry stays while the sync is off. Android has no precompiled Reanimated: its
   Gradle script compiles the flag in.
3. **e2e builds trace Explore's sheet.** Explore passes HomeSheet `trace` in its e2e build only. The trace logs, once on
   focus and on each change, gorhom's index and position, the sheet's top in the committed tree and the sync as
   compiled (`sync=`).
   `run-parity-ci.sh` prints the lines. The trace is read-only: no render, no snap. `drawn` means the committed transform
   matches gorhom's position; the opacity is not measured.
4. **Reduced motion stays on in CI.** `transition_animation_scale=0` is a member's setting to cover.

**Alternatives.**

- **Reanimated 4.5.3.** It erases a view's props only once React has them (`syncedTags_`, read from its published
  sources). Expo SDK 57 pins 4.5.1 (`expo/bundledNativeModules.json`); leaving the pin is a separate choice for the
  integrator, and `expo doctor` would flag it.
- **A patch of 4.5.1's registry** (bun patch of `AnimatedPropsRegistry.cpp`). It keeps the sync's saving, but the club
  would maintain a native patch of a dependency until the SDK moves.
- **A re-snap that forces a move** (`snapToPosition`, or a two-step index change, on focus). It would cover a lost style
  for this sheet only, not for the other animated views at rest, and with motion on it would move a sheet already in
  place.

**Consequences.**

- Every animated view keeps its last props for its life: the sheet, and the globe's frame, the clouds, the progress
  line at rest. Each React commit re-applies them, which costs more `ShadowNode` clones per commit. The flag was there
  to save that.
- The change reaches members only with a new native build (both platforms). An OTA update does not carry it.
- Parity's runs are the only evidence, and they cut one way (Context, what a run can show): a green run does not show
  the race gone, and a red one is a failed fix whose trace says how it failed.

**Turning the sync back on.** Only with a Reanimated that erases a view's props once React has them (4.5.3 as read), and
only after green parity runs under reduced motion on a build with the sync on whose traces say `drawn` and `sync=on`.
The flag and the `buildFromSource` entry go together: Expo's precompiled iOS Reanimated is the sync on, so dropping the
entry earlier would turn it back on for iOS alone. `reanimated-flags.test.ts` fails on a version change, so an upgrade
re-reads this record.
