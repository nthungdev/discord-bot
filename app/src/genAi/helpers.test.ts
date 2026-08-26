import { describe, it, expect } from "vitest";
import { IGNORED_CONTENT, ALLOWED_CONTENT_TYPES } from "./helpers";

describe("genAi helpers", () => {
  it("should define IGNORED_CONTENT string", () => {
    expect(typeof IGNORED_CONTENT).toBe("string");
  });

  it("should define valid ALLOWED_CONTENT_TYPES array", () => {
    expect(ALLOWED_CONTENT_TYPES).toContain("image/jpeg");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/png");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/gif");
  });
});
