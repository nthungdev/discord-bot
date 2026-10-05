import { describe, expect, it, vi } from "vitest";
import * as handler from "../../../../services/roast/handler";
import { data, execute } from "../roast";

describe("/roast command alias", () => {
  it("should have correct command metadata and options", () => {
    const json = data.toJSON();
    expect(json.name).toBe("roast");
    expect(json.name_localizations).toEqual(
      expect.objectContaining({
        vi: "chan",
        "en-US": "roast",
      }),
    );
    const options = json.options || [];
    expect(options.length).toBe(4);

    expect(options[0].name).toBe("target");
    expect(options[0].required).toBe(true);

    expect(options[1].name).toBe("topic");
    expect(options[1].required).toBe(true);

    expect(options[2].name).toBe("intensity");
    expect(options[2].required).toBeFalsy();
    // @ts-expect-error choices property check
    expect(options[2].choices?.length).toBe(3);

    expect(options[3].name).toBe("preview");
    expect(options[3].required).toBeFalsy();
  });

  it("should delegate execution to executeRoast", async () => {
    const spy = vi.spyOn(handler, "executeRoast").mockResolvedValue();
    await execute({} as unknown as Parameters<typeof execute>[0]);
    expect(spy).toHaveBeenCalled();
  });
});
