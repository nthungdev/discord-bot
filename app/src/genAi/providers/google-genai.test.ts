import { describe, it, expect, vi, beforeEach } from "vitest";
import { MyGoogleGenAI } from "./google-genai";
import type { GenAiConfig } from "../types";

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    interactions = {
      create: vi.fn().mockResolvedValue({
        output_text: "Generated response from Google GenAI",
      }),
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
  };
});

describe("MyGoogleGenAI", () => {
  const config: GenAiConfig = {
    apiKey: "test-api-key",
    provider: "google-genai",
    apiEndpoint: "endpoint",
    projectId: "project-1",
    locationId: "us-central1",
    modelId: "gemini-2.5-flash",
    maxOutputTokens: 1000,
    systemInstruction: "You are a friendly bot.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error if generate is called before init", async () => {
    const provider = new MyGoogleGenAI(config);
    await expect(provider.generate({ text: "Hello" })).rejects.toThrow(
      "AI API not initialized",
    );
  });

  it("should initialize and generate content successfully", async () => {
    const provider = new MyGoogleGenAI(config);
    await provider.init();
    const response = await provider.generate({ text: "Hello" });

    expect(response.content).toBe("Generated response from Google GenAI");
  });
});
