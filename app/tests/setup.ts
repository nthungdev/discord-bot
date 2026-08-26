import { afterEach, vi } from "vitest";
import defaultConfig from "../src/config/defaultConfig.json";
import { Config } from "../src/config";

// Configure default test environment variables
process.env.NODE_ENV = "test";
process.env.BEARER_TOKEN = "test-bearer-token";
process.env.CHATBOT_TOKEN = "test-chatbot-token";
process.env.POLICE_BOT_TOKEN = "test-policebot-token";
process.env.PORT = "3001";

// Default mocks for Config singleton methods
vi.spyOn(Config.prototype, "loadConfig").mockImplementation(async () => {});
vi.spyOn(Config.prototype, "init").mockImplementation(async () => {});
vi.spyOn(Config.prototype, "getConfigValue").mockImplementation((key: string) => {
  return (defaultConfig as Record<string, unknown>)[key] as never;
});

afterEach(() => {
  // Clear mock history but preserve spy implementations
  vi.clearAllMocks();
});
