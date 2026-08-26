import { vi } from "vitest";
import type { GenAi } from "../../src/genAi/types";
import type { AiPromptResponse } from "../../src/types";

export const createMockGenAi = (
  responseOverrides?: Partial<AiPromptResponse>,
): GenAi => {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({
      content: "Mock AI response",
      ...responseOverrides,
    }),
  };
};
