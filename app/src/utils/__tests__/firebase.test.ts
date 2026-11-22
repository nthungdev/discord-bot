import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initFirebaseIfNeeded,
  loadServiceAccount,
  resolveServiceAccountPath,
  shouldInitializeFirebase,
} from "../firebase";

const { mockApps, mockInitializeApp, mockCert } = vi.hoisted(() => ({
  mockApps: [] as unknown[],
  mockInitializeApp: vi.fn(),
  mockCert: vi.fn((serviceAccount: unknown) => ({
    mockedCredential: serviceAccount,
  })),
}));

vi.mock("firebase-admin", () => ({
  apps: mockApps,
  initializeApp: mockInitializeApp,
  credential: {
    cert: mockCert,
  },
}));

describe("shouldInitializeFirebase", () => {
  it("should return true when configSource is remote-config", () => {
    expect(shouldInitializeFirebase({ configSource: "remote-config" })).toBe(
      true,
    );
  });

  it("should return true when memoryStoreType is firestore", () => {
    expect(
      shouldInitializeFirebase({
        configSource: "directus",
        memoryStoreType: "firestore",
        aiProvider: "antigravity",
      }),
    ).toBe(true);
  });

  it("should return true when aiProvider is vertex", () => {
    expect(
      shouldInitializeFirebase({
        configSource: "directus",
        memoryStoreType: "directus",
        aiProvider: "vertex",
      }),
    ).toBe(true);
  });

  it("should return false for directus/local with antigravity or google-genai", () => {
    expect(
      shouldInitializeFirebase({
        configSource: "directus",
        memoryStoreType: "directus",
        aiProvider: "antigravity",
      }),
    ).toBe(false);

    expect(
      shouldInitializeFirebase({
        configSource: "directus",
        memoryStoreType: "local",
        aiProvider: "google-genai",
      }),
    ).toBe(false);

    expect(shouldInitializeFirebase({ configSource: "local" })).toBe(false);
  });
});

describe("initFirebaseIfNeeded", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    mockApps.length = 0;
    mockInitializeApp.mockReset();
    mockCert.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should skip initialization and log an info message when not needed", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const existsSpy = vi.spyOn(fs, "existsSync");

    const initialized = initFirebaseIfNeeded({
      configSource: "directus",
      memoryStoreType: "directus",
      aiProvider: "antigravity",
    });

    expect(initialized).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping Firebase Admin initialization"),
    );
    expect(existsSpy).not.toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it("should initialize firebase-admin when needed and service-account.json exists", () => {
    const serviceAccount = {
      type: "service_account",
      project_id: "demo-project",
      client_email: "firebase-adminsdk@demo-project.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n",
    };

    vi.spyOn(fs, "existsSync").mockImplementation(
      (candidate) => String(candidate) === "/tmp/mock-service-account.json",
    );
    vi.spyOn(fs, "statSync").mockReturnValue({
      isFile: () => true,
    } as fs.Stats);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify(serviceAccount),
    );

    const initialized = initFirebaseIfNeeded({
      configSource: "remote-config",
      serviceAccountPath: "/tmp/mock-service-account.json",
    });

    expect(initialized).toBe(true);
    expect(mockCert).toHaveBeenCalledWith(serviceAccount);
    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: { mockedCredential: serviceAccount },
    });
  });

  it("should return true without re-initializing when admin.apps is already non-empty", () => {
    mockApps.push({ name: "[DEFAULT]" });
    const existsSpy = vi.spyOn(fs, "existsSync");

    const initialized = initFirebaseIfNeeded({
      configSource: "directus",
      memoryStoreType: "firestore",
    });

    expect(initialized).toBe(true);
    expect(existsSpy).not.toHaveBeenCalled();
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });

  it("should log a warning and return false without throwing when needed but service-account.json is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const initialized = initFirebaseIfNeeded({
      configSource: "directus",
      aiProvider: "vertex",
    });

    expect(initialized).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("service-account.json was not found"),
    );
    expect(mockInitializeApp).not.toHaveBeenCalled();
  });
});

describe("resolveServiceAccountPath", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should return null when explicit customPath is missing or not a regular file without falling back", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/fallback-sa.json";
    vi.spyOn(fs, "existsSync").mockImplementation(
      (candidate) => String(candidate) === "/tmp/fallback-sa.json",
    );
    vi.spyOn(fs, "statSync").mockReturnValue({
      isFile: () => true,
    } as fs.Stats);

    expect(resolveServiceAccountPath("/tmp/missing-custom.json")).toBeNull();
    expect(resolveServiceAccountPath("   ")).toBeNull();

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "statSync").mockReturnValue({
      isFile: () => false,
    } as fs.Stats);
    expect(resolveServiceAccountPath("/tmp/a-directory")).toBeNull();
  });
});

describe("loadServiceAccount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null and log a warning on malformed JSON", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "statSync").mockReturnValue({
      isFile: () => true,
    } as fs.Stats);
    vi.spyOn(fs, "readFileSync").mockReturnValue("{invalid json");

    expect(loadServiceAccount("/tmp/malformed.json")).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to read or parse service account file at /tmp/malformed.json",
      ),
    );
  });

  it("should return null and log a warning on non-object JSON values", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "statSync").mockReturnValue({
      isFile: () => true,
    } as fs.Stats);

    for (const rawJson of ["null", "[1, 2, 3]", '"str"']) {
      warnSpy.mockClear();
      vi.spyOn(fs, "readFileSync").mockReturnValue(rawJson);

      expect(loadServiceAccount("/tmp/non-object.json")).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("is not a JSON object. Ignoring."),
      );
    }
  });
});
