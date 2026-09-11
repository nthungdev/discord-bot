import { describe, it, expect, vi, beforeEach } from "vitest";
import { VertexGenAi } from "./vertex";
import type { GenAiConfig } from "../types";
import { ToolDefinition } from "../../tools/types";

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

const mockGetGenerativeModel = vi.fn();

vi.mock("@google-cloud/vertexai", () => {
  class MockVertexAI {
    getGenerativeModel = mockGetGenerativeModel;
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

  const mockModel = {
    startChat: vi.fn().mockReturnValue(mockChat),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue(mockModel);
  });

  it("should throw error if generate is called before init", async () => {
    const provider = new VertexGenAi(config);
    await expect(provider.generate({ text: "Hello" })).rejects.toThrow(
      "AI API not initialized",
    );
  });

  it("should initialize and generate content successfully", async () => {
    mockChat.sendMessage.mockResolvedValueOnce({
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
    });

    const provider = new VertexGenAi(config);
    await provider.init();
    const response = await provider.generate({ text: "Hello" });

    expect(response.content).toBe("Response from Vertex AI");
  });

  it("should execute tool calls and pass responses back to chat in VertexGenAi", async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ channelCount: 5 });
    const dummyTool: ToolDefinition = {
      name: "discord_list_channels",
      description: "List channels",
      parameters: { type: "OBJECT", properties: {} },
      execute: mockToolExecute,
    };

    // First call returns functionCall, second call returns final text
    mockChat.sendMessage
      .mockResolvedValueOnce({
        response: {
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "discord_list_channels",
                      args: {},
                    },
                  },
                ],
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        response: {
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ text: "Found 5 channels in this server." }],
              },
            },
          ],
        },
      });

    const provider = new VertexGenAi(config);
    await provider.init();
    const response = await provider.generate({
      text: "How many channels?",
      tools: [dummyTool],
      toolContext: { botId: "bot123" },
    });

    expect(mockToolExecute).toHaveBeenCalledWith({}, { botId: "bot123" });
    expect(mockChat.sendMessage).toHaveBeenCalledTimes(2);
    expect(response.content).toBe("Found 5 channels in this server.");
  });
});
