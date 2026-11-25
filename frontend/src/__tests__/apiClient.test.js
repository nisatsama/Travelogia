import { describe, it, expect } from "vitest";
import api, { setAuthToken, getAuthToken, getErrorMessage } from "../api/client";

describe("Frontend API Client utilities", () => {
  it("stores bearer token strictly in memory and attaches it on demand", () => {
    setAuthToken("sample-memory-jwt");
    expect(getAuthToken()).toBe("sample-memory-jwt");
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });

  it("extracts safe user-friendly error messages from API and network errors", () => {
    expect(
      getErrorMessage({
        response: { data: { message: "Travel date cannot be in the past." } },
      }),
    ).toBe("Travel date cannot be in the past.");

    expect(getErrorMessage({ code: "ECONNABORTED" })).toContain("timed out");
    expect(getErrorMessage({})).toContain("Network error");
    expect(getErrorMessage({ response: {} }, "Fallback message")).toBe(
      "Fallback message",
    );
  });

  it("configures axios with credentials and CSRF header", () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });
});
