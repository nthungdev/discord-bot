import fs from "node:fs/promises";
import path from "node:path";
import * as admin from "firebase-admin";
import { Config, ConfigParameter } from "../../config";

export interface IRoastOptOutStore {
  isOptedOut(guildId: string, userId: string): Promise<boolean>;
  optOut(guildId: string, userId: string): Promise<void>;
  optIn(guildId: string, userId: string): Promise<void>;
  clear(guildId?: string): Promise<void>;
}

export class LocalFileRoastOptOutStore implements IRoastOptOutStore {
  private filePath: string;
  private optOuts: Set<string> = new Set();
  private isLoaded = false;

  constructor(customPath?: string) {
    this.filePath =
      customPath || path.resolve(process.cwd(), ".data", "roast-opt-outs.json");
  }

  private getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const records: string[] = JSON.parse(content);
      this.optOuts = new Set(records);
    } catch {
      this.optOuts.clear();
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const records = Array.from(this.optOuts.values());
    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(records, null, 2), "utf-8");
    await fs.rename(tempFile, this.filePath);
  }

  public async isOptedOut(guildId: string, userId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.optOuts.has(this.getKey(guildId, userId));
  }

  public async optOut(guildId: string, userId: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.getKey(guildId, userId);
    if (!this.optOuts.has(key)) {
      this.optOuts.add(key);
      await this.persist();
    }
  }

  public async optIn(guildId: string, userId: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.getKey(guildId, userId);
    if (this.optOuts.has(key)) {
      this.optOuts.delete(key);
      await this.persist();
    }
  }

  public async clear(guildId?: string): Promise<void> {
    await this.ensureLoaded();
    if (guildId) {
      const prefix = `${guildId}:`;
      for (const key of Array.from(this.optOuts.values())) {
        if (key.startsWith(prefix)) {
          this.optOuts.delete(key);
        }
      }
    } else {
      this.optOuts.clear();
    }
    await this.persist();
  }
}

export class FirestoreRoastOptOutStore implements IRoastOptOutStore {
  private collectionName = "roast_opt_outs";

  private getDb(): admin.firestore.Firestore {
    return admin.firestore();
  }

  private getDocId(guildId: string, userId: string): string {
    return `${guildId}_${userId}`;
  }

  public async isOptedOut(guildId: string, userId: string): Promise<boolean> {
    try {
      const doc = await this.getDb()
        .collection(this.collectionName)
        .doc(this.getDocId(guildId, userId))
        .get();
      return doc.exists;
    } catch (error) {
      console.error("[FirestoreRoastOptOutStore] isOptedOut error:", error);
      return false;
    }
  }

  public async optOut(guildId: string, userId: string): Promise<void> {
    try {
      await this.getDb()
        .collection(this.collectionName)
        .doc(this.getDocId(guildId, userId))
        .set({
          guildId,
          userId,
          optedOutAt: Date.now(),
        });
    } catch (error) {
      console.error("[FirestoreRoastOptOutStore] optOut error:", error);
    }
  }

  public async optIn(guildId: string, userId: string): Promise<void> {
    try {
      await this.getDb()
        .collection(this.collectionName)
        .doc(this.getDocId(guildId, userId))
        .delete();
    } catch (error) {
      console.error("[FirestoreRoastOptOutStore] optIn error:", error);
    }
  }

  public async clear(guildId?: string): Promise<void> {
    try {
      const db = this.getDb();
      let query: admin.firestore.Query = db.collection(this.collectionName);
      if (guildId) {
        query = query.where("guildId", "==", guildId);
      }
      const snapshot = await query.get();
      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    } catch (error) {
      console.error("[FirestoreRoastOptOutStore] clear error:", error);
    }
  }
}

let optOutStoreInstance: IRoastOptOutStore | null = null;

export function getRoastOptOutStore(): IRoastOptOutStore {
  if (!optOutStoreInstance) {
    try {
      const storeType = Config.getInstance().getConfigValue(
        ConfigParameter.memoryStoreType,
      );
      if (storeType === "firestore") {
        optOutStoreInstance = new FirestoreRoastOptOutStore();
      } else {
        optOutStoreInstance = new LocalFileRoastOptOutStore();
      }
    } catch {
      optOutStoreInstance = new LocalFileRoastOptOutStore();
    }
  }
  return optOutStoreInstance;
}

export function setRoastOptOutStore(store: IRoastOptOutStore | null): void {
  optOutStoreInstance = store;
}
