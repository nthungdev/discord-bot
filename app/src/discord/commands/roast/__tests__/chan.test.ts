import { describe, expect, it, vi } from "vitest";
import * as handler from "../../../../services/roast/handler";
import { data, execute } from "../chan";

describe("/chan command", () => {
  it("should have correct command metadata and options", () => {
    const json = data.toJSON();
    expect(json.name).toBe("chan");
    expect(json.name_localizations).toEqual(
      expect.objectContaining({
        vi: "chan",
        "en-US": "roast",
      }),
    );
    expect(json.options?.length).toBe(4);

    const targetOpt = json.options?.find((o) => o.name === "muc-tieu");
    expect(targetOpt).toBeDefined();
    expect(targetOpt?.required).toBe(true);

    const intensityOpt = json.options?.find((o) => o.name === "muc-do");
    expect(intensityOpt).toBeDefined();
    // @ts-expect-error choices property check
    expect(intensityOpt?.choices?.length).toBe(3);
  });

  it("should delegate execution to executeRoast", async () => {
    const spy = vi.spyOn(handler, "executeRoast").mockResolvedValue();
    await execute({} as unknown as Parameters<typeof execute>[0]);
    expect(spy).toHaveBeenCalled();
  });
});
