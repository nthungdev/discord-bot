import { afterEach, vi } from "vitest";
import { type AppConfigData, Config } from "../src/config";

const mockTestConfig: AppConfigData = {
  guildEmojis: {},
  guildMembers: {},
  bots: {
    chatBot: { guilds: {} },
    policeBot: { guilds: {} },
  },
  checkInLeaderboard: "",
  aiSafetySettings: { safetySettings: [] },
  aiProjectId: "test-project",
  aiModelId: "gemini-3.6-flash",
  aiMaxOutputTokens: 1024,
  aiLocationId: "us-central1",
  aiProvider: "google-genai",
  aiApiEndpoint: "",
  aiMaxConversationHistory: 60,
  memoryStoreType: "local",
};

// Configure default test environment variables
process.env.NODE_ENV = "test";
process.env.BEARER_TOKEN = "test-bearer-token";
process.env.CHATBOT_TOKEN = "test-chatbot-token";
process.env.POLICE_BOT_TOKEN = "test-policebot-token";
process.env.PORT = "3001";

// Default mocks for Config singleton methods
vi.spyOn(Config.prototype, "loadConfig").mockImplementation(async () => {});
vi.spyOn(Config.prototype, "init").mockImplementation(async () => {});
vi.spyOn(Config.prototype, "getLocalConfig").mockReturnValue(mockTestConfig);
vi.spyOn(Config.prototype, "getConfigValue").mockImplementation(
  (key: string) => {
    return (mockTestConfig as unknown as Record<string, unknown>)[key] as never;
  },
);

afterEach(() => {
  // Clear mock history but preserve spy implementations
  vi.clearAllMocks();
});
