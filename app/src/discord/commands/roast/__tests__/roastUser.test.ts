import { ApplicationCommandType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import * as handler from "../../../../services/roast/handler";
import { data, execute } from "../roastUser";

describe("Roast User Context Menu command", () => {
  it("should be registered as User context menu command with localizations", () => {
    const json = data.toJSON();
    expect(json.name).toBe("Roast User");
    expect(json.name_localizations).toEqual(
      expect.objectContaining({
        vi: "Chan người này",
        "en-US": "Roast User",
      }),
    );
    expect(json.type).toBe(ApplicationCommandType.User);
  });

  it("should delegate execution to executeRoast", async () => {
    const spy = vi.spyOn(handler, "executeRoast").mockResolvedValue();
    await execute({} as unknown as Parameters<typeof execute>[0]);
    expect(spy).toHaveBeenCalled();
  });
});
