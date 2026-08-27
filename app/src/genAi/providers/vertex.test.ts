import { describe, it, expect, vi, beforeEach } from "vitest";
import { VertexGenAi } from "./vertex";
import type { GenAiConfig } from "../types";

vi.mock("../../utils/google", () => ({
  getCredentials: vi.fn().mockResolvedValue({}),
}));

const mockChat = {
  sendMessage: vi.fn().mockResolvedValue({
    response: {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: "Response from Vertex AI" }],
          },
        },
      ],
    },
  }),
};

const mockModel = {
  startChat: vi.fn().mockReturnValue(mockChat),
};

vi.mock("@google-cloud/vertexai", () => {
  class MockVertexAI {
    getGenerativeModel = vi.fn().mockReturnValue(mockModel);
  }

  return {
    VertexAI: MockVertexAI,
    FinishReason: {
      STOP: "STOP",
    },
    ClientError: class ClientError extends Error {},
  };
});

describe("VertexGenAi", () => {
  const config: GenAiConfig = {
    provider: "vertex",
    apiEndpoint: "endpoint",
    projectId: "project-1",
    locationId: "us-central1",
    modelId: "gemini-2.5-flash",
    maxOutputTokens: 1000,
    systemInstruction: "You are a helpful assistant.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error if generate is called before init", async () => {
    const provider = new VertexGenAi(config);
    await expect(provider.generate({ text: "Hello" })).rejects.toThrow(
      "AI API not initialized",
    );
  });

  it("should initialize and generate content successfully", async () => {
    const provider = new VertexGenAi(config);
    await provider.init();
    const response = await provider.generate({ text: "Hello" });

    expect(response.content).toBe("Response from Vertex AI");
  });
});
