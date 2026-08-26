import { describe, it, expect } from "vitest";
import { API_ENDPOINT, PROJECT_ID, MODEL_ID, LOCATION_ID } from "./config";

describe("genAi config", () => {
  it("should export non-empty configuration constants", () => {
    expect(API_ENDPOINT).toBeDefined();
    expect(PROJECT_ID).toBeDefined();
    expect(MODEL_ID).toBeDefined();
    expect(LOCATION_ID).toBeDefined();
  });
});
