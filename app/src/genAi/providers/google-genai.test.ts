import { describe, it, expect, vi, beforeEach } from "vitest";
import { MyGoogleGenAI } from "./google-genai";
import type { GenAiConfig } from "../types";
import { ToolDefinition } from "../../tools/types";

const mockSendMessage = vi.fn();
const mockCreateChat = vi.fn(() => ({
  sendMessage: mockSendMessage,
}));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    chats = {
      create: mockCreateChat,
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
    mockSendMessage.mockResolvedValueOnce({
      text: "Generated response from Google GenAI",
      functionCalls: undefined,
    });

    const provider = new MyGoogleGenAI(config);
    await provider.init();
    const response = await provider.generate({ text: "Hello" });

    expect(response.content).toBe("Generated response from Google GenAI");
    expect(mockCreateChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
      }),
    );
  });

  it("should execute function calls in tool loop and return final response", async () => {
    const mockToolExecute = vi.fn().mockResolvedValue({ ownerName: "alice" });
    const dummyTool: ToolDefinition = {
      name: "discord_get_server_owner",
      description: "Gets server owner",
      parameters: { type: "OBJECT", properties: {} },
      execute: mockToolExecute,
    };

    // First turn returns function call, second turn returns final text
    mockSendMessage
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [
          {
            name: "discord_get_server_owner",
            args: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "The server owner is alice.",
        functionCalls: undefined,
      });

    const provider = new MyGoogleGenAI(config);
    await provider.init();
    const response = await provider.generate({
      text: "Who owns this server?",
      tools: [dummyTool],
      toolContext: { botId: "bot123" },
    });

    expect(mockToolExecute).toHaveBeenCalledWith({}, { botId: "bot123" });
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(response.content).toBe("The server owner is alice.");
  });
});
