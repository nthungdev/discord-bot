import { describe, expect, it, vi } from "vitest";
import type { IUserProfileRepository } from "../../../domain/repositories/user-profile.repository";
import { ValorantAiCoach } from "../ai-coach";
import { RiotClientAdapter } from "../riot-client-adapter";
import {
  InvalidRiotIdFormatError,
  parseRiotId,
  UserNotLinkedError,
  ValorantService,
} from "../valorant-service";

describe("ValorantService", () => {
  it("should parse valid Riot IDs and throw for invalid ones", () => {
    expect(parseRiotId("TenZ#NA1")).toEqual({ name: "TenZ", tag: "NA1" });
    expect(parseRiotId(" Hung # VN1 ")).toEqual({ name: "Hung", tag: "VN1" });

    expect(() => parseRiotId("InvalidNoTag")).toThrow(InvalidRiotIdFormatError);
    expect(() => parseRiotId("Too#Many#Tags")).toThrow(
      InvalidRiotIdFormatError,
    );
    expect(() => parseRiotId("#OnlyTag")).toThrow(InvalidRiotIdFormatError);
  });

  it("should link user account successfully", async () => {
    const mockRepo: IUserProfileRepository = {
      isOptedOut: vi.fn(),
      setOptOut: vi.fn(),
      getProfile: vi.fn(),
      clearOptOuts: vi.fn(),
      linkRiotAccount: vi.fn().mockResolvedValue(undefined),
      unlinkRiotAccount: vi.fn(),
      getRiotProfile: vi.fn(),
      setLastKnownMatchId: vi.fn(),
    };

    const service = new ValorantService(
      new RiotClientAdapter(""),
      new ValorantAiCoach(),
      mockRepo,
    );

    const result = await service.linkAccount("user-1", "TenZ#NA1", "na");

    expect(result.account.name).toBe("TenZ");
    expect(result.account.tag).toBe("NA1");
    expect(mockRepo.linkRiotAccount).toHaveBeenCalledWith(
      "user-1",
      "TenZ#NA1",
      "na",
      expect.any(String),
    );
  });

  it("should throw UserNotLinkedError when fetching summary for unlinked user", async () => {
    const mockRepo: IUserProfileRepository = {
      isOptedOut: vi.fn(),
      setOptOut: vi.fn(),
      getProfile: vi.fn(),
      clearOptOuts: vi.fn(),
      linkRiotAccount: vi.fn(),
      unlinkRiotAccount: vi.fn(),
      getRiotProfile: vi.fn().mockResolvedValue(null),
      setLastKnownMatchId: vi.fn(),
    };

    const service = new ValorantService(
      new RiotClientAdapter(""),
      new ValorantAiCoach(),
      mockRepo,
    );

    await expect(service.getPersonalSummary("unlinked-user")).rejects.toThrow(
      UserNotLinkedError,
    );
  });

  it("should return personal summary with coaching for linked user", async () => {
    const mockRepo: IUserProfileRepository = {
      isOptedOut: vi.fn(),
      setOptOut: vi.fn(),
      getProfile: vi.fn(),
      clearOptOuts: vi.fn(),
      linkRiotAccount: vi.fn(),
      unlinkRiotAccount: vi.fn(),
      getRiotProfile: vi.fn().mockResolvedValue({
        riotId: "Hung#VN1",
        region: "ap",
        puuid: "mock-puuid-hung-vn1",
      }),
      setLastKnownMatchId: vi.fn(),
    };

    const service = new ValorantService(
      new RiotClientAdapter(""),
      new ValorantAiCoach(),
      mockRepo,
    );

    const summary = await service.getPersonalSummary("user-1");

    expect(summary.gameName).toBe("Hung");
    expect(summary.tagLine).toBe("VN1");
    expect(summary.kdRatio).toBeGreaterThan(0);
    expect(summary.aiCoachVerdict).toBeDefined();
    expect(summary.aiCoachVerdict?.strength).toBeDefined();
  });

  it("should compare two linked users and produce deltas and verdict", async () => {
    const mockRepo: IUserProfileRepository = {
      isOptedOut: vi.fn(),
      setOptOut: vi.fn(),
      getProfile: vi.fn(),
      clearOptOuts: vi.fn(),
      linkRiotAccount: vi.fn(),
      unlinkRiotAccount: vi.fn(),
      getRiotProfile: vi.fn().mockImplementation((userId: string) => {
        if (userId === "u1") {
          return Promise.resolve({
            riotId: "P1#NA1",
            region: "na",
            puuid: "puuid-1",
          });
        }
        return Promise.resolve({
          riotId: "P2#NA1",
          region: "na",
          puuid: "puuid-2",
        });
      }),
      setLastKnownMatchId: vi.fn(),
    };

    const service = new ValorantService(
      new RiotClientAdapter(""),
      new ValorantAiCoach(),
      mockRepo,
    );

    const comparison = await service.getComparison("u1", "u2");

    expect(comparison.player1.gameName).toBe("P1");
    expect(comparison.player2.gameName).toBe("P2");
    expect(comparison.deltas).toBeDefined();
    expect(comparison.aiVerdict?.verdict).toBeDefined();
  });
});
