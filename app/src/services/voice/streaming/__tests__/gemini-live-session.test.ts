import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveSession } from "../gemini-live-session";

const mockConnect = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      live = {
        connect: mockConnect,
      };
    },
    Modality: {
      AUDIO: "AUDIO",
      TEXT: "TEXT",
    },
  };
});

describe("GeminiLiveSession", () => {
  let mockLiveHandle: {
    sendRealtimeInput: ReturnType<typeof vi.fn>;
    sendClientContent: ReturnType<typeof vi.fn>;
    sendToolResponse: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let capturedCallbacks: {
    onopen?: () => void;
    onmessage?: (msg: Record<string, unknown>) => Promise<void>;
    onerror?: (err: unknown) => void;
    onclose?: (e: unknown) => void;
  } = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockLiveHandle = {
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    };

    mockConnect.mockImplementation(async (params: unknown) => {
      const typedParams = params as { callbacks: typeof capturedCallbacks };
      capturedCallbacks = typedParams.callbacks;
      return mockLiveHandle;
    });
  });

  it("should connect and set session as active", async () => {
    const session = new GeminiLiveSession();
    expect(session.isConnected()).toBe(false);

    await session.connect({
      apiKey: "test-api-key",
      modelId: "gemini-3.8-live",
      voiceName: "Aoede",
    });

    expect(session.isConnected()).toBe(true);
  });

  it("should throw error if no API key is available", async () => {
    const session = new GeminiLiveSession();
    const originalKey = process.env.GEMINI_API_KEY;
    const originalLegacyKey = process.env.AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_API_KEY;

    await expect(session.connect({})).rejects.toThrow(
      "Gemini API key is required to start Gemini Live voice session.",
    );

    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
    }
    if (originalLegacyKey) {
      process.env.AI_API_KEY = originalLegacyKey;
    }
  });

  it("should dispatch audio and text events from incoming messages", async () => {
    const session = new GeminiLiveSession();
    await session.connect({ apiKey: "test-api-key" });

    const audioListener = vi.fn();
    const textListener = vi.fn();
    const turnCompleteListener = vi.fn();

    session.on("audio", audioListener);
    session.on("text", textListener);
    session.on("turnComplete", turnCompleteListener);

    const testPcm = Buffer.alloc(960, 42);
    const base64Audio = testPcm.toString("base64");

    await capturedCallbacks.onmessage?.({
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: "audio/pcm;rate=24000",
              },
            },
            { text: "Hello from Voice Companion!" },
          ],
        },
        turnComplete: true,
      },
    });

    expect(audioListener).toHaveBeenCalledWith(testPcm);
    expect(textListener).toHaveBeenCalledWith("Hello from Voice Companion!");
    expect(turnCompleteListener).toHaveBeenCalledTimes(1);
  });

  it("should dispatch interrupted event when model detects server-side barge-in", async () => {
    const session = new GeminiLiveSession();
    await session.connect({ apiKey: "test-api-key" });

    const interruptedListener = vi.fn();
    session.on("interrupted", interruptedListener);

    await capturedCallbacks.onmessage?.({
      serverContent: {
        interrupted: true,
      },
    });

    expect(interruptedListener).toHaveBeenCalledTimes(1);
  });

  it("should send audio chunks through sendRealtimeInput", async () => {
    const session = new GeminiLiveSession();
    await session.connect({ apiKey: "test-api-key" });

    const chunk16k = Buffer.alloc(640, 15);
    session.sendAudioChunk(chunk16k);

    expect(mockLiveHandle.sendRealtimeInput).toHaveBeenCalledWith({
      audio: {
        data: chunk16k.toString("base64"),
        mimeType: "audio/pcm;rate=16000",
      },
    });
  });

  it("should send structured clientContent", async () => {
    const session = new GeminiLiveSession();
    await session.connect({ apiKey: "test-api-key" });

    session.sendClientContent(
      [
        {
          role: "user",
          parts: [{ text: "[Speaker: @alice] What time is it?" }],
        },
      ],
      false,
    );

    expect(mockLiveHandle.sendClientContent).toHaveBeenCalledWith({
      turns: [
        {
          role: "user",
          parts: [{ text: "[Speaker: @alice] What time is it?" }],
        },
      ],
      turnComplete: false,
    });
  });

  it("should gracefully close session and reset connection state", async () => {
    const session = new GeminiLiveSession();
    await session.connect({ apiKey: "test-api-key" });
    expect(session.isConnected()).toBe(true);

    await session.close();
    expect(mockLiveHandle.close).toHaveBeenCalledTimes(1);
    expect(session.isConnected()).toBe(false);
  });
});
