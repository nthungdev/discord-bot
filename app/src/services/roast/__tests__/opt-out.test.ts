import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileRoastOptOutStore } from "../opt-out";

describe("LocalFileRoastOptOutStore", () => {
  const testFilePath = path.resolve(
    process.cwd(),
    ".data",
    `test-roast-opt-outs-${Date.now()}.json`,
  );
  let store: LocalFileRoastOptOutStore;

  beforeEach(() => {
    store = new LocalFileRoastOptOutStore(testFilePath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // ignore
    }
  });

  it("should return false for user who has not opted out", async () => {
    const optedOut = await store.isOptedOut("guild-1", "user-1");
    expect(optedOut).toBe(false);
  });

  it("should register opt-out and persist to file", async () => {
    await store.optOut("guild-1", "user-1");
    expect(await store.isOptedOut("guild-1", "user-1")).toBe(true);

    // Verify persistence across new store instance
    const newStore = new LocalFileRoastOptOutStore(testFilePath);
    expect(await newStore.isOptedOut("guild-1", "user-1")).toBe(true);
  });

  it("should remove user from registry on optIn", async () => {
    await store.optOut("guild-1", "user-1");
    expect(await store.isOptedOut("guild-1", "user-1")).toBe(true);

    await store.optIn("guild-1", "user-1");
    expect(await store.isOptedOut("guild-1", "user-1")).toBe(false);
  });

  it("should isolate opt-outs by guild", async () => {
    await store.optOut("guild-1", "user-1");
    expect(await store.isOptedOut("guild-1", "user-1")).toBe(true);
    expect(await store.isOptedOut("guild-2", "user-1")).toBe(false);
  });

  it("should clear opt-outs for a specific guild", async () => {
    await store.optOut("guild-1", "user-1");
    await store.optOut("guild-2", "user-1");

    await store.clear("guild-1");
    expect(await store.isOptedOut("guild-1", "user-1")).toBe(false);
    expect(await store.isOptedOut("guild-2", "user-1")).toBe(true);
  });
});
