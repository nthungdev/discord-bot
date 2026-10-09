import fs from "node:fs/promises";
import path from "node:path";
import * as admin from "firebase-admin";
import { Config, ConfigParameter } from "../../config";
import type { IRoleStore, OnboardingConfig, RolePanel } from "./types";

interface RoleFileStorageData {
  panels: Record<string, RolePanel>;
  onboarding: Record<string, OnboardingConfig>;
}

export class LocalFileRoleStore implements IRoleStore {
  private filePath: string;
  private data: RoleFileStorageData = {
    panels: {},
    onboarding: {},
  };
  private isLoaded = false;

  constructor(customPath?: string) {
    this.filePath =
      customPath ||
      path.resolve(process.cwd(), ".data", "role-assignments.json");
  }

  private getPanelKey(guildId: string, panelId: string): string {
    return `${guildId}:${panelId}`;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content);
      this.data = {
        panels: parsed.panels ?? {},
        onboarding: parsed.onboarding ?? {},
      };
    } catch {
      this.data = {
        panels: {},
        onboarding: {},
      };
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(this.data, null, 2), "utf-8");
    await fs.rename(tempFile, this.filePath);
  }

  public async getPanel(
    guildId: string,
    panelId: string,
  ): Promise<RolePanel | null> {
    await this.ensureLoaded();
    const key = this.getPanelKey(guildId, panelId);
    return this.data.panels[key] ?? null;
  }

  public async getPanelsByGuild(guildId: string): Promise<RolePanel[]> {
    await this.ensureLoaded();
    return Object.values(this.data.panels).filter(
      (panel) => panel.guildId === guildId,
    );
  }

  public async savePanel(panel: RolePanel): Promise<void> {
    await this.ensureLoaded();
    const key = this.getPanelKey(panel.guildId, panel.id);
    this.data.panels[key] = { ...panel };
    await this.persist();
  }

  public async deletePanel(guildId: string, panelId: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.getPanelKey(guildId, panelId);
    if (key in this.data.panels) {
      delete this.data.panels[key];
      await this.persist();
    }
  }

  public async getOnboardingConfig(
    guildId: string,
  ): Promise<OnboardingConfig | null> {
    await this.ensureLoaded();
    return this.data.onboarding[guildId] ?? null;
  }

  public async saveOnboardingConfig(config: OnboardingConfig): Promise<void> {
    await this.ensureLoaded();
    this.data.onboarding[config.guildId] = { ...config };
    await this.persist();
  }

  public async clear(guildId?: string): Promise<void> {
    await this.ensureLoaded();
    if (guildId) {
      const panelPrefix = `${guildId}:`;
      for (const key of Object.keys(this.data.panels)) {
        if (key.startsWith(panelPrefix)) {
          delete this.data.panels[key];
        }
      }
      delete this.data.onboarding[guildId];
    } else {
      this.data.panels = {};
      this.data.onboarding = {};
    }
    await this.persist();
  }
}

/**
 * Recursively removes undefined fields from an object to ensure safe Firestore serialization.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== "object") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result as T;
}

export class FirestoreRoleStore implements IRoleStore {
  private panelCollectionName = "role_panels";
  private onboardingCollectionName = "role_onboarding";

  private getDb(): admin.firestore.Firestore {
    return admin.firestore();
  }

  private getPanelDocId(guildId: string, panelId: string): string {
    return `${guildId}_${panelId}`;
  }

  public async getPanel(
    guildId: string,
    panelId: string,
  ): Promise<RolePanel | null> {
    try {
      const doc = await this.getDb()
        .collection(this.panelCollectionName)
        .doc(this.getPanelDocId(guildId, panelId))
        .get();
      if (!doc.exists) return null;
      return doc.data() as RolePanel;
    } catch (error) {
      console.error("[FirestoreRoleStore] getPanel error:", error);
      return null;
    }
  }

  public async getPanelsByGuild(guildId: string): Promise<RolePanel[]> {
    try {
      const snapshot = await this.getDb()
        .collection(this.panelCollectionName)
        .where("guildId", "==", guildId)
        .get();
      return snapshot.docs.map((doc) => doc.data() as RolePanel);
    } catch (error) {
      console.error("[FirestoreRoleStore] getPanelsByGuild error:", error);
      return [];
    }
  }

  public async savePanel(panel: RolePanel): Promise<void> {
    try {
      await this.getDb()
        .collection(this.panelCollectionName)
        .doc(this.getPanelDocId(panel.guildId, panel.id))
        .set(sanitizeForFirestore(panel));
    } catch (error) {
      console.error("[FirestoreRoleStore] savePanel error:", error);
      throw error;
    }
  }

  public async deletePanel(guildId: string, panelId: string): Promise<void> {
    try {
      await this.getDb()
        .collection(this.panelCollectionName)
        .doc(this.getPanelDocId(guildId, panelId))
        .delete();
    } catch (error) {
      console.error("[FirestoreRoleStore] deletePanel error:", error);
      throw error;
    }
  }

  public async getOnboardingConfig(
    guildId: string,
  ): Promise<OnboardingConfig | null> {
    try {
      const doc = await this.getDb()
        .collection(this.onboardingCollectionName)
        .doc(guildId)
        .get();
      if (!doc.exists) return null;
      return doc.data() as OnboardingConfig;
    } catch (error) {
      console.error("[FirestoreRoleStore] getOnboardingConfig error:", error);
      return null;
    }
  }

  public async saveOnboardingConfig(config: OnboardingConfig): Promise<void> {
    try {
      await this.getDb()
        .collection(this.onboardingCollectionName)
        .doc(config.guildId)
        .set(sanitizeForFirestore(config));
    } catch (error) {
      console.error("[FirestoreRoleStore] saveOnboardingConfig error:", error);
      throw error;
    }
  }

  public async clear(guildId?: string): Promise<void> {
    try {
      const db = this.getDb();
      const batch = db.batch();

      let panelsQuery: admin.firestore.Query = db.collection(
        this.panelCollectionName,
      );
      if (guildId) {
        panelsQuery = panelsQuery.where("guildId", "==", guildId);
      }
      const panelSnap = await panelsQuery.get();
      for (const doc of panelSnap.docs) {
        batch.delete(doc.ref);
      }

      if (guildId) {
        batch.delete(db.collection(this.onboardingCollectionName).doc(guildId));
      } else {
        const onboardingSnap = await db
          .collection(this.onboardingCollectionName)
          .get();
        for (const doc of onboardingSnap.docs) {
          batch.delete(doc.ref);
        }
      }

      await batch.commit();
    } catch (error) {
      console.error("[FirestoreRoleStore] clear error:", error);
    }
  }
}

let roleStoreInstance: IRoleStore | null = null;

export function getRoleStore(): IRoleStore {
  if (!roleStoreInstance) {
    try {
      const storeType = Config.getInstance().getConfigValue(
        ConfigParameter.memoryStoreType,
      );
      if (storeType === "firestore") {
        roleStoreInstance = new FirestoreRoleStore();
      } else {
        roleStoreInstance = new LocalFileRoleStore();
      }
    } catch {
      roleStoreInstance = new LocalFileRoleStore();
    }
  }
  return roleStoreInstance;
}

export function setRoleStore(store: IRoleStore | null): void {
  roleStoreInstance = store;
}
