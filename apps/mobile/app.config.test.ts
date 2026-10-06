import { describe, expect, it } from "bun:test";
import { assertProductionEnv, assertStagingEnv } from "./app.config";

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
