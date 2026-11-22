import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadServiceAccount } from "../firebase";
import {
  getAccessToken,
  getCredentials,
  resetCredentialsCache,
} from ".././google";

const {
  mockGetAccessToken,
  mockGetCredentials,
  jwtConstructorArgs,
  googleAuthConstructorArgs,
} = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn(),
  mockGetCredentials: vi.fn(),
  jwtConstructorArgs: [] as unknown[],
  googleAuthConstructorArgs: [] as unknown[],
}));

vi.mock("../firebase", () => ({
  loadServiceAccount: vi.fn(),
}));

vi.mock("google-auth-library", () => {
  class MockJWT {
    constructor(options: unknown) {
      jwtConstructorArgs.push(options);
    }
    getAccessToken = mockGetAccessToken;
  }
  class MockGoogleAuth {
    constructor(options: unknown) {
      googleAuthConstructorArgs.push(options);
    }
    getCredentials = mockGetCredentials;
  }
  return {
    JWT: MockJWT,
    GoogleAuth: MockGoogleAuth,
  };
});

const mockServiceAccount = {
  type: "service_account",
  project_id: "test-project",
  client_email: "test@example.com",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nmock-key\n-----END PRIVATE KEY-----\n",
};

describe("google utils", () => {
  beforeEach(() => {
    resetCredentialsCache();
    jwtConstructorArgs.length = 0;
    googleAuthConstructorArgs.length = 0;
    mockGetAccessToken.mockReset().mockResolvedValue({
      token: "mock-access-token",
    });
    mockGetCredentials.mockReset().mockResolvedValue({
      client_email: "test@example.com",
    });
    vi.mocked(loadServiceAccount)
      .mockReset()
      .mockReturnValue(mockServiceAccount);
  });

  it("should retrieve an access token using the loaded service account", async () => {
    const token = await getAccessToken();

    expect(token).toBe("mock-access-token");
    expect(loadServiceAccount).toHaveBeenCalledTimes(1);
    expect(jwtConstructorArgs).toEqual([
      {
        email: mockServiceAccount.client_email,
        key: mockServiceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
    ]);
  });

  it("should throw a clear error from getAccessToken when service-account.json is missing", async () => {
    vi.mocked(loadServiceAccount).mockReturnValue(null);

    await expect(getAccessToken()).rejects.toThrow(
      "Service account file (service-account.json) not found",
    );
  });

  it("should retrieve credentials and cache them until resetCredentialsCache is called", async () => {
    const firstCreds = await getCredentials();
    const secondCreds = await getCredentials();

    expect(firstCreds).toEqual({ client_email: "test@example.com" });
    expect(secondCreds).toBe(firstCreds);
    expect(loadServiceAccount).toHaveBeenCalledTimes(1);
    expect(mockGetCredentials).toHaveBeenCalledTimes(1);
    expect(googleAuthConstructorArgs).toEqual([
      {
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        credentials: mockServiceAccount,
      },
    ]);

    resetCredentialsCache();
    mockGetCredentials.mockResolvedValueOnce({
      client_email: "refreshed@example.com",
    });

    const refreshedCreds = await getCredentials();
    expect(refreshedCreds).toEqual({ client_email: "refreshed@example.com" });
    expect(loadServiceAccount).toHaveBeenCalledTimes(2);
    expect(mockGetCredentials).toHaveBeenCalledTimes(2);
  });

  it("should throw a clear error from getCredentials when service-account.json is missing", async () => {
    vi.mocked(loadServiceAccount).mockReturnValue(null);

    await expect(getCredentials()).rejects.toThrow(
      "Service account file (service-account.json) not found",
    );
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it("should throw a clear error when service-account.json is missing client_email or private_key", async () => {
    vi.mocked(loadServiceAccount).mockReturnValue({
      type: "service_account",
      private_key: mockServiceAccount.private_key,
    });
    await expect(getAccessToken()).rejects.toThrow(
      "Invalid service account credentials: client_email and private_key must be non-empty strings.",
    );

    vi.mocked(loadServiceAccount).mockReturnValue({
      type: "service_account",
      client_email: mockServiceAccount.client_email,
      private_key: "   ",
    });
    await expect(getCredentials()).rejects.toThrow(
      "Invalid service account credentials: client_email and private_key must be non-empty strings.",
    );
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });
});
