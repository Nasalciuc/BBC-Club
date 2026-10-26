import { AndroidConfig, XML, withAndroidManifest, withDangerousMod, type ConfigPlugin } from "expo/config-plugins";

/** The Android emulator's alias for the machine running it — where the e2e API listens. */
const EMULATOR_HOST = "10.0.2.2";
const RESOURCE = "e2e_network_security_config";

/** res/xml/e2e_network_security_config.xml: cleartext to the emulator host, nothing else. */
const networkSecurityConfig = {
  "network-security-config": {
    "base-config": [{ $: { cleartextTrafficPermitted: "false" } }],
    "domain-config": [
      {
        $: { cleartextTrafficPermitted: "true" },
        domain: [{ $: { includeSubdomains: "false" }, _: EMULATOR_HOST }],
      },
    ],
  },
};

/** Lets the e2e APK call http://10.0.2.2:8000 (release builds refuse cleartext by default).
 *  app.config.ts applies it only when EXPO_PUBLIC_APP_ENV=e2e; no other build ever sees it. */
const withE2eCleartext: ConfigPlugin = (config) => {
  const withXml = withDangerousMod(config, [
    "android",
    async (c) => {
      const res = await AndroidConfig.Paths.getResourceFolderAsync(c.modRequest.projectRoot);
      await XML.writeXMLAsync({ path: `${res}/xml/${RESOURCE}.xml`, xml: networkSecurityConfig });
      return c;
    },
  ]);
  return withAndroidManifest(withXml, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$["android:networkSecurityConfig"] = `@xml/${RESOURCE}`;
    return c;
  });
};

export default withE2eCleartext;
