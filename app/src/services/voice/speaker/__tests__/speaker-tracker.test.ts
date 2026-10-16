import type { GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { SpeakerTracker } from "../speaker-tracker";

describe("SpeakerTracker", () => {
  const mockMember = (id: string, username: string, displayName: string) =>
    ({
      id,
      displayName,
      user: { id, username },
    }) as unknown as GuildMember;

  it("should register guild members and track speaker profiles", () => {
    const tracker = new SpeakerTracker();
    const member = mockMember("user-1", "alice", "Alice Wonder");

    const profile = tracker.registerMember(member);
    expect(profile.userId).toBe("user-1");
    expect(profile.username).toBe("alice");
    expect(profile.displayName).toBe("Alice Wonder");
    expect(profile.isOptedOut).toBe(false);

    const retrieved = tracker.getSpeakerByUserId("user-1");
    expect(retrieved).toEqual(profile);
  });

  it("should map SSRC to user ID and retrieve speaker by SSRC", () => {
    const tracker = new SpeakerTracker();
    const member = mockMember("user-2", "bob", "Bob Dylan");
    tracker.registerMember(member);

    tracker.mapSsrc(987654, "user-2");
    const retrieved = tracker.getSpeakerBySsrc(987654);
    expect(retrieved?.userId).toBe("user-2");
    expect(retrieved?.ssrc).toBe(987654);

    expect(tracker.getSpeakerBySsrc(11111)).toBeUndefined();
  });

  it("should handle opt-out and suppress opted-out users", () => {
    const tracker = new SpeakerTracker();
    const member = mockMember("user-3", "charlie", "Charlie");
    tracker.registerMember(member);

    expect(tracker.isUserOptedOut("user-3")).toBe(false);

    tracker.setOptOut("user-3", true);
    expect(tracker.isUserOptedOut("user-3")).toBe(true);
    expect(tracker.getSpeakerByUserId("user-3")?.isOptedOut).toBe(true);

    tracker.setOptOut("user-3", false);
    expect(tracker.isUserOptedOut("user-3")).toBe(false);
  });

  it("should format speaker tags for Gemini Live clientContent", () => {
    const tracker = new SpeakerTracker();
    const member = mockMember("user-4", "dan", "Dan The Man");
    tracker.registerMember(member);

    expect(tracker.formatSpeakerTag("user-4")).toBe(
      "[Speaker: @dan (Dan The Man)]",
    );
    expect(tracker.formatSpeakerTag("unknown-user")).toBe(
      "[Speaker: <@unknown-user>]",
    );
  });

  it("should track speaking status and timestamps", () => {
    const tracker = new SpeakerTracker();
    const member = mockMember("user-5", "eve", "Eve");
    tracker.registerMember(member);

    tracker.setSpeaking("user-5", true);
    const profile = tracker.getSpeakerByUserId("user-5");
    expect(profile?.isSpeaking).toBe(true);
    expect(profile?.lastSpokeAt).toBeGreaterThan(0);

    tracker.setSpeaking("user-5", false);
    expect(profile?.isSpeaking).toBe(false);
  });
});
