import { describe, expect, it } from "bun:test";
import type { ExpoConfig } from "expo/config";
import { assertProductionEnv, assertStagingEnv, dialable, withFirebase } from "./app.config";
import { telHref } from "./src/lib/support-phone-logic";

const complete = {
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_API_URL: "https://api.buybusinessclass.com",
  EXPO_PUBLIC_PRIVACY_URL: "https://buybusinessclass.com/privacy",
  EXPO_PUBLIC_TERMS_URL: "https://buybusinessclass.com/terms",
  EXPO_PUBLIC_MAPBOX_TOKEN: "pk.test",
};

describe("assertStagingEnv", () => {
  it("refuses a staging build without an https API address", () => {
    expect(() => assertStagingEnv({ EXPO_PUBLIC_APP_ENV: "staging" })).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() =>
      assertStagingEnv({ EXPO_PUBLIC_APP_ENV: "staging", EXPO_PUBLIC_API_URL: "http://10.0.2.2:8000" }),
    ).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("accepts the tunnel or the company domain", () => {
    expect(() =>
      assertStagingEnv({
        EXPO_PUBLIC_APP_ENV: "staging",
        EXPO_PUBLIC_API_URL: "https://airport-time-resulted-expanded.trycloudflare.com",
      }),
    ).not.toThrow();
  });

  it("never checks another environment", () => {
    expect(() => assertStagingEnv({ EXPO_PUBLIC_APP_ENV: "e2e" })).not.toThrow();
  });
});

describe("assertProductionEnv", () => {
  it("names a missing privacy URL", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_PRIVACY_URL: undefined })).toThrow(
      /EXPO_PUBLIC_PRIVACY_URL/,
    );
  });

  it("names a missing terms URL", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_TERMS_URL: undefined })).toThrow(
      /EXPO_PUBLIC_TERMS_URL/,
    );
  });

  it("names a missing API URL", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_API_URL: undefined })).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("names every missing value at once", () => {
    expect(() =>
      assertProductionEnv({
        EXPO_PUBLIC_APP_ENV: "production",
      }),
    ).toThrow(/EXPO_PUBLIC_API_URL.*EXPO_PUBLIC_PRIVACY_URL.*EXPO_PUBLIC_TERMS_URL.*EXPO_PUBLIC_MAPBOX_TOKEN/s);
  });

  it("names a missing Mapbox token", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_MAPBOX_TOKEN: undefined })).toThrow(
      /EXPO_PUBLIC_MAPBOX_TOKEN/,
    );
  });

  it("refuses a secret Mapbox token", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_MAPBOX_TOKEN: "sk.secret" })).toThrow(
      /EXPO_PUBLIC_MAPBOX_TOKEN/,
    );
  });

  it("refuses an http API", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_API_URL: "http://api.buybusinessclass.com" })).toThrow(
      /EXPO_PUBLIC_API_URL/,
    );
  });

  it("accepts a complete https production set", () => {
    expect(() => assertProductionEnv(complete)).not.toThrow();
  });

  it("never checks a non-production env, even when values are missing", () => {
    for (const env of ["development", "staging", "e2e", undefined]) {
      expect(() =>
        assertProductionEnv({
          EXPO_PUBLIC_APP_ENV: env,
          EXPO_PUBLIC_API_URL: "http://localhost:8000",
        }),
      ).not.toThrow();
    }
  });

  it("leaves EXPO_PUBLIC_SUPPORT_PHONE optional", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_SUPPORT_PHONE: undefined })).not.toThrow();
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_SUPPORT_PHONE: "" })).not.toThrow();
  });

  it("refuses a general line the app cannot dial, and takes one it can", () => {
    // Made-up numbers in the fictional 555 range.
    for (const wrong of ["+1 212 555 0148 ext 2", "1 212 555 0148", "+44 (0)20 7946 0018"]) {
      expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_SUPPORT_PHONE: wrong })).toThrow(
        /EXPO_PUBLIC_SUPPORT_PHONE/,
      );
      expect(() =>
        assertStagingEnv({
          EXPO_PUBLIC_APP_ENV: "staging",
          EXPO_PUBLIC_API_URL: "https://api.buybusinessclass.com",
          EXPO_PUBLIC_SUPPORT_PHONE: wrong,
        }),
      ).toThrow(/EXPO_PUBLIC_SUPPORT_PHONE/);
    }
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_SUPPORT_PHONE: "+12125550148" })).not.toThrow();
    expect(() =>
      assertStagingEnv({
        EXPO_PUBLIC_APP_ENV: "staging",
        EXPO_PUBLIC_API_URL: "https://api.buybusinessclass.com",
        EXPO_PUBLIC_SUPPORT_PHONE: "+1 (212) 555-0148",
      }),
    ).not.toThrow();
  });

  it("refuses an http privacy URL", () => {
    expect(() =>
      assertProductionEnv({ ...complete, EXPO_PUBLIC_PRIVACY_URL: "http://buybusinessclass.com/privacy" }),
    ).toThrow(/EXPO_PUBLIC_PRIVACY_URL/);
  });

  it("refuses an http terms URL", () => {
    expect(() =>
      assertProductionEnv({ ...complete, EXPO_PUBLIC_TERMS_URL: "http://buybusinessclass.com/terms" }),
    ).toThrow(/EXPO_PUBLIC_TERMS_URL/);
  });

  it("refuses a file privacy URL", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_PRIVACY_URL: "file:///privacy" })).toThrow(
      /EXPO_PUBLIC_PRIVACY_URL/,
    );
  });

  it("refuses a file terms URL", () => {
    expect(() => assertProductionEnv({ ...complete, EXPO_PUBLIC_TERMS_URL: "file:///terms" })).toThrow(
      /EXPO_PUBLIC_TERMS_URL/,
    );
  });
});

describe("dialable", () => {
  it("answers as the app's telHref does, for every number either test names", () => {
    // Made-up numbers (the fictional 555 range; Ofcom's drama range for London).
    const numbers = [
      "",
      " ",
      "+4412345",
      "+44123456",
      "+12125550148",
      "+1 (212) 555-0148",
      " +1.212.555.0148 ",
      "+44 20 7946 0018",
      "+1 212 555 0148 ext 2",
      "+1 212 555 0148 x2",
      "+1 212 555 0148 22",
      "+1 212 555 0148 (22)",
      "+1 212+555 0148",
      "1 212 555 0148",
      "+1-800-FLY-0148",
      "+1 212 555 0148 0148 01",
      "+44 (0)20 7946 0018",
      "+1\u00A0212\u00A0555\u00A00148",
      "\u202D+1 (212) 555\u20110148\u202C",
      "\u202A+1 212-555-0148\u202C",
      "+1 212\u2013555\u20130148",
    ];
    for (const phone of numbers) {
      expect({ phone, dialable: dialable(phone) }).toEqual({ phone, dialable: telHref(phone) !== null });
    }
  });
});

describe("withFirebase", () => {
  const app = { name: "BBC Club", slug: "bbc-club", android: { package: "com.buybusinessclass.club" } } as ExpoConfig;

  it("leaves the build exactly app.json without the file variable", () => {
    expect(withFirebase(app, {})).toBe(app);
    expect(withFirebase(app, { GOOGLE_SERVICES_JSON: "" })).toBe(app);
  });

  it("points Android at the file EAS put on the build machine, and keeps the rest", () => {
    const out = withFirebase(app, { GOOGLE_SERVICES_JSON: "/home/expo/workingdir/google-services.json" });
    expect(out.android).toEqual({
      package: "com.buybusinessclass.club",
      googleServicesFile: "/home/expo/workingdir/google-services.json",
    });
    expect(app.android).toEqual({ package: "com.buybusinessclass.club" });
  });
});
