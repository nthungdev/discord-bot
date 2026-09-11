import { describe, it, expect, vi } from "vitest";
import { getAccessToken, getCredentials } from "./google";

vi.mock("google-auth-library", () => {
  class MockJWT {
    getAccessToken = vi.fn().mockResolvedValue({ token: "mock-access-token" });
  }
  class MockGoogleAuth {
    getCredentials = vi.fn().mockResolvedValue({ client_email: "test@example.com" });
  }
  return {
    JWT: MockJWT,
    GoogleAuth: MockGoogleAuth,
  };
});

describe("google utils", () => {
  it("should retrieve access token", async () => {
    const token = await getAccessToken();
    expect(token).toBe("mock-access-token");
  });

  it("should retrieve credentials", async () => {
    const creds = await getCredentials();
    expect(creds).toEqual({ client_email: "test@example.com" });
  });
});
