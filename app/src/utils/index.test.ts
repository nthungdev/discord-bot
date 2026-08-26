import { describe, it, expect, vi } from "vitest";
import { getRandomSleepReminderMessage, imageToBase64 } from "./index";
import axios from "axios";

vi.mock("axios");

describe("general utils", () => {
  describe("getRandomSleepReminderMessage", () => {
    it("should generate sleep reminder message formatted with member mentions", () => {
      const message = getRandomSleepReminderMessage(["user1", "user2"]);
      expect(message).toContain("<@user1>");
      expect(message).toContain("<@user2>");
    });
  });

  describe("imageToBase64", () => {
    it("should download image buffer and encode to base64", async () => {
      const buffer = Buffer.from("fake-image-bytes");
      vi.spyOn(axios, "get").mockResolvedValueOnce({
        data: buffer,
      });

      const base64 = await imageToBase64("http://example.com/pic.png");
      expect(base64).toBe(buffer.toString("base64"));
    });
  });
});
