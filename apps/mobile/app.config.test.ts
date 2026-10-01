import { describe, expect, it } from "bun:test";
import { assertProductionEnv } from "./app.config";

const complete = {
  EXPO_PUBLIC_APP_ENV: "production",
  EXPO_PUBLIC_API_URL: "https://api.buybusinessclass.com",
  EXPO_PUBLIC_PRIVACY_URL: "https://buybusinessclass.com/privacy",
  EXPO_PUBLIC_TERMS_URL: "https://buybusinessclass.com/terms",
};

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
    ).toThrow(/EXPO_PUBLIC_API_URL.*EXPO_PUBLIC_PRIVACY_URL.*EXPO_PUBLIC_TERMS_URL/s);
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
});
