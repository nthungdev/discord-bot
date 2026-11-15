import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "../../../tools/types";
import type { GenAiConfig } from "../../types";
import { MyGoogleGenAI } from ".././google-genai";

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
    modelId: "gemini-3.5-flash",
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
        model: "gemini-3.5-flash",
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

  it("should send temperature and topP in the chat config when set", async () => {
    mockSendMessage.mockResolvedValueOnce({ text: "ok" });
    const provider = new MyGoogleGenAI({
      ...config,
      temperature: 0.9,
      topP: 0.8,
    });
    await provider.init();
    await provider.generate({ text: "Hello" });

    expect(mockCreateChat).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          maxOutputTokens: 1000,
          temperature: 0.9,
          topP: 0.8,
        }),
      }),
    );
  });

  it("should omit temperature and topP from the chat config when unset", async () => {
    mockSendMessage.mockResolvedValueOnce({ text: "ok" });
    const provider = new MyGoogleGenAI(config);
    await provider.init();
    await provider.generate({ text: "Hello" });

    const chatConfig = (
      mockCreateChat.mock.calls[0] as unknown as [{ config: object }]
    )[0].config;
    expect(chatConfig).not.toHaveProperty("temperature");
    expect(chatConfig).not.toHaveProperty("topP");
  });
});
