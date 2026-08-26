import { describe, it, expect, vi, beforeEach } from "vitest";
import { data, execute } from "./checkIn";
import { createMockInteraction } from "../../../../tests/fixtures/discord";
import * as genAiUtils from "../../../utils/genAi";
import { memoryService } from "../../../services/memory";

vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn().mockReturnValue({
    init: vi.fn().mockResolvedValue(undefined),
  }),
  generateChatMessageWithGenAi: vi.fn().mockResolvedValue({
    content: "Good job checking in!",
  }),
}));

vi.mock("../../../services/memory", () => ({
  memoryService: {
    addTurn: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("checkIn command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have valid command metadata", () => {
    expect(data.name).toBe("checkin");
  });

  it("should reply directly without AI comment when slavegonComment is false", async () => {
    const interaction = createMockInteraction({
      client: {
        user: { id: "bot-1" },
        users: { cache: new Map() },
      },
      options: {
        getBoolean: vi.fn().mockReturnValue(false),
        getString: vi.fn().mockReturnValue("completed 5km run"),
        getUser: vi.fn().mockReturnValue(null),
        getMember: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
      } as unknown as ReturnType<typeof createMockInteraction>["options"],
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      "*Test User checked in completed 5km run*",
    );
  });

  it("should generate AI comment and persist to memory when slavegonComment is true", async () => {
    const interaction = createMockInteraction({
      client: {
        user: { id: "bot-1" },
        users: { cache: new Map() },
      },
      options: {
        getBoolean: vi.fn().mockReturnValue(true),
        getString: vi.fn().mockReturnValue("completed task"),
        getUser: vi.fn().mockReturnValue(null),
        getMember: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
      } as unknown as ReturnType<typeof createMockInteraction>["options"],
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(genAiUtils.generateChatMessageWithGenAi).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      "*Test User checked in completed task*\nGood job checking in!",
    );
    expect(memoryService.addTurn).toHaveBeenCalled();
  });
});
