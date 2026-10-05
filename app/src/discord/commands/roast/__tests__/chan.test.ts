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
    const options = json.options || [];
    expect(options.length).toBe(4);

    expect(options[0].name).toBe("muc-tieu");
    expect(options[0].required).toBe(true);

    expect(options[1].name).toBe("chu-de");
    expect(options[1].required).toBe(true);

    expect(options[2].name).toBe("muc-do");
    expect(options[2].required).toBeFalsy();
    // @ts-expect-error choices property check
    expect(options[2].choices?.length).toBe(3);

    expect(options[3].name).toBe("xem-truoc");
    expect(options[3].required).toBeFalsy();
  });

  it("should delegate execution to executeRoast", async () => {
    const spy = vi.spyOn(handler, "executeRoast").mockResolvedValue();
    await execute({} as unknown as Parameters<typeof execute>[0]);
    expect(spy).toHaveBeenCalled();
  });
});
