import fs from "node:fs/promises";
import path from "node:path";
import * as admin from "firebase-admin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirestoreRoleStore,
  getRoleStore,
  LocalFileRoleStore,
  setRoleStore,
} from "../store";
import type { OnboardingConfig, RolePanel } from "../types";

describe("RoleStore", () => {
  const testDir = path.resolve(process.cwd(), ".data", "test-roles");
  const testFilePath = path.join(testDir, "role-assignments.json");

  const samplePanel: RolePanel = {
    id: "notifications",
    guildId: "guild-1",
    title: "Notification Settings",
    description: "Choose your notifications",
    type: "button",
    mode: "multi",
    roles: [
      { roleId: "role-1", label: "Announcements", emoji: "📢" },
      { roleId: "role-2", label: "Events", emoji: "🎉" },
    ],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleOnboarding: OnboardingConfig = {
    guildId: "guild-1",
    enabled: true,
    panelId: "notifications",
    channelId: "channel-welcome",
    welcomeMessage: "Welcome {user} to {server}!",
    updatedAt: 1000,
  };

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    setRoleStore(null);
  });

  describe("LocalFileRoleStore", () => {
    it("should save and retrieve role panels", async () => {
      const store = new LocalFileRoleStore(testFilePath);
      expect(await store.getPanel("guild-1", "notifications")).toBeNull();

      await store.savePanel(samplePanel);
      const retrieved = await store.getPanel("guild-1", "notifications");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("notifications");
      expect(retrieved?.roles.length).toBe(2);
    });

    it("should list panels by guild", async () => {
      const store = new LocalFileRoleStore(testFilePath);
      await store.savePanel(samplePanel);
      await store.savePanel({
        ...samplePanel,
        id: "colors",
        title: "Color Roles",
        type: "dropdown",
        mode: "single",
      });
      await store.savePanel({
        ...samplePanel,
        id: "other",
        guildId: "guild-2",
      });

      const guild1Panels = await store.getPanelsByGuild("guild-1");
      expect(guild1Panels.length).toBe(2);
      expect(guild1Panels.map((p) => p.id)).toEqual([
        "notifications",
        "colors",
      ]);
    });

    it("should delete panels cleanly", async () => {
      const store = new LocalFileRoleStore(testFilePath);
      await store.savePanel(samplePanel);
      expect(await store.getPanel("guild-1", "notifications")).not.toBeNull();

      await store.deletePanel("guild-1", "notifications");
      expect(await store.getPanel("guild-1", "notifications")).toBeNull();
    });

    it("should save, retrieve, and update onboarding configs", async () => {
      const store = new LocalFileRoleStore(testFilePath);
      expect(await store.getOnboardingConfig("guild-1")).toBeNull();

      await store.saveOnboardingConfig(sampleOnboarding);
      const retrieved = await store.getOnboardingConfig("guild-1");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.enabled).toBe(true);
      expect(retrieved?.panelId).toBe("notifications");
    });

    it("should clear records by guild or all", async () => {
      const store = new LocalFileRoleStore(testFilePath);
      await store.savePanel(samplePanel);
      await store.saveOnboardingConfig(sampleOnboarding);
      await store.savePanel({
        ...samplePanel,
        id: "g2-panel",
        guildId: "guild-2",
      });

      await store.clear("guild-1");
      expect(await store.getPanel("guild-1", "notifications")).toBeNull();
      expect(await store.getOnboardingConfig("guild-1")).toBeNull();
      expect(await store.getPanel("guild-2", "g2-panel")).not.toBeNull();

      await store.clear();
      expect(await store.getPanel("guild-2", "g2-panel")).toBeNull();
    });
  });

  describe("FirestoreRoleStore", () => {
    it("should interact with Firestore collections", async () => {
      const mockDocGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => samplePanel,
      });
      const mockDocSet = vi.fn().mockResolvedValue(undefined);
      const mockDocDelete = vi.fn().mockResolvedValue(undefined);

      const mockCollection = vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: mockDocGet,
          set: mockDocSet,
          delete: mockDocDelete,
        }),
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: [{ data: () => samplePanel }],
          }),
        }),
      });

      vi.spyOn(admin, "firestore").mockReturnValue({
        collection: mockCollection,
        batch: vi.fn().mockReturnValue({
          delete: vi.fn(),
          commit: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as admin.firestore.Firestore);

      const store = new FirestoreRoleStore();
      const panel = await store.getPanel("guild-1", "notifications");
      expect(panel?.id).toBe("notifications");

      const panelWithUndefined: RolePanel = {
        ...samplePanel,
        roles: [
          {
            roleId: "role-1",
            label: "Role 1",
            emoji: undefined,
            description: undefined,
          },
        ],
      };

      await store.savePanel(panelWithUndefined);
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.not.objectContaining({
          roles: [
            expect.objectContaining({
              emoji: undefined,
            }),
          ],
        }),
      );

      await store.deletePanel("guild-1", "notifications");
      expect(mockDocDelete).toHaveBeenCalled();

      const panels = await store.getPanelsByGuild("guild-1");
      expect(panels.length).toBe(1);
    });

    it("should strip undefined values in sanitizeForFirestore", async () => {
      const { sanitizeForFirestore } = await import("../store");
      const dirty = {
        a: "hello",
        b: undefined,
        nested: {
          c: 123,
          d: undefined,
        },
        arr: [{ x: 1, y: undefined }],
      };
      const cleaned = sanitizeForFirestore(dirty);
      expect(cleaned).toEqual({
        a: "hello",
        nested: { c: 123 },
        arr: [{ x: 1 }],
      });
      expect(cleaned).not.toHaveProperty("b");
    });
  });

  describe("Store Factory", () => {
    it("should provide a default singleton store instance", () => {
      const store = getRoleStore();
      expect(store).toBeInstanceOf(LocalFileRoleStore);
    });

    it("should allow setting a custom store instance", () => {
      const customStore = new LocalFileRoleStore(testFilePath);
      setRoleStore(customStore);
      expect(getRoleStore()).toBe(customStore);
    });
  });
});
