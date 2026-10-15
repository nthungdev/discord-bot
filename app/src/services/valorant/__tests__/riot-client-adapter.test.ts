import { describe, expect, it } from "vitest";
import { RiotClientAdapter } from "../riot-client-adapter";

describe("RiotClientAdapter", () => {
  it("should return realistic mock account when no API key is provided", async () => {
    const adapter = new RiotClientAdapter("");
    const account = await adapter.getAccount("Hung", "VN1");

    expect(account.name).toBe("Hung");
    expect(account.tag).toBe("VN1");
    expect(account.puuid).toContain("hung-vn1");
    expect(account.account_level).toBeGreaterThan(0);
  });

  it("should return realistic mock MMR when no API key is provided", async () => {
    const adapter = new RiotClientAdapter("");
    const mmr = await adapter.getMmr("ap", "test-puuid");

    expect(mmr.current_data.currenttierpatched).toBe("Ascendant 3");
    expect(mmr.current_data.ranking_in_tier).toBe(68);
  });

  it("should return realistic mock matches when no API key is provided", async () => {
    const adapter = new RiotClientAdapter("");
    const matches = await adapter.getMatches("ap", "test-puuid", 5);

    expect(matches).toHaveLength(5);
    expect(matches[0].players.all_players[0].puuid).toBe("test-puuid");
    expect(matches[0].metadata.mode).toBe("Competitive");
  });

  it("should return mock live match when in mock mode", async () => {
    const adapter = new RiotClientAdapter("");
    const live = await adapter.getLiveMatch("ap", "test-puuid");

    expect(live).not.toBeNull();
    expect(live?.map_name).toBe("Ascent");
    expect(live?.players.length).toBeGreaterThan(0);
  });

  it("should cache account responses within TTL", async () => {
    const adapter = new RiotClientAdapter("");
    const account1 = await adapter.getAccount("Dung", "VN2");
    const account2 = await adapter.getAccount("Dung", "VN2");

    expect(account1).toBe(account2); // Exact reference from in-memory cache
  });

  it("should clear cache when clearCache is called", async () => {
    const adapter = new RiotClientAdapter("");
    const account1 = await adapter.getAccount("Dung", "VN2");
    adapter.clearCache();
    const account2 = await adapter.getAccount("Dung", "VN2");

    expect(account1).not.toBe(account2); // New object generated
    expect(account1.puuid).toBe(account2.puuid);
  });
});
