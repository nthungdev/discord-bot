import { describe, it, expect } from "vitest";
import { createGenAi } from "./index";
import { MyGoogleGenAI } from "./google-genai";
import { VertexGenAi } from "./vertex";
import type { GenAiConfig } from "../types";

describe("createGenAi factory", () => {
  const baseConfig: GenAiConfig = {
    apiKey: "test-key",
    provider: "google-genai",
    apiEndpoint: "endpoint",
    projectId: "project-1",
    locationId: "us-central1",
    modelId: "gemini-2.5-flash",
    maxOutputTokens: 1000,
  };

  it("should create MyGoogleGenAI instance when provider is google-genai", () => {
    const provider = createGenAi({ ...baseConfig, provider: "google-genai" });
    expect(provider).toBeInstanceOf(MyGoogleGenAI);
  });

  it("should create VertexGenAi instance when provider is vertex", () => {
    const provider = createGenAi({ ...baseConfig, provider: "vertex" });
    expect(provider).toBeInstanceOf(VertexGenAi);
  });

  it("should throw error for unsupported provider", () => {
    expect(() =>
      createGenAi({ ...baseConfig, provider: "unsupported" as unknown as "vertex" }),
    ).toThrow("Unsupported GenAI provider: unsupported");
  });
});
