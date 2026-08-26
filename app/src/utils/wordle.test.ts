import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { getAnswer } from "./wordle";

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(),
      get: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

vi.mock("axios-cache-interceptor", () => ({
  setupCache: vi.fn((instance) => instance),
}));

describe("wordle utils", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch wordle solution successfully", async () => {
    vi.spyOn(axios, "get").mockResolvedValueOnce({
      data: {
        id: 123,
        solution: "react",
        print_date: "2026-08-26",
      },
    });

    const answer = await getAnswer("2026-08-26");
    expect(answer).toBe("react");
  });

  it("should return null and handle errors gracefully when API fails", async () => {
    vi.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network error"));

    const answer = await getAnswer("2026-08-26");
    expect(answer).toBeNull();
  });
});
