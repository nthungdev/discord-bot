import fs from "node:fs";
import path from "node:path";
import { ConversationDocument } from "../../types";
import { IMemoryStore } from "./types";

export class LocalFileMemoryStore implements IMemoryStore {
  private filePath: string;
  private cache: Map<string, ConversationDocument> = new Map();
  private isLoaded = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(customPath?: string) {
    this.filePath =
      customPath ||
      path.resolve(process.cwd(), ".data", "conversations.json");
  }

  private getKey(botId: string, channelId: string): string {
    return `${botId}_${channelId}`;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = await fs.promises.readFile(this.filePath, "utf-8");
        if (fileContent.trim()) {
          const parsed = JSON.parse(fileContent) as Record<
            string,
            ConversationDocument
          >;
          for (const [key, doc] of Object.entries(parsed)) {
            this.cache.set(key, doc);
          }
        }
      }
    } catch (error) {
      console.error(
        `[LocalFileMemoryStore] Failed to load store from ${this.filePath}`,
        error
      );
    } finally {
      this.isLoaded = true;
    }
  }

  private async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const serialized: Record<string, ConversationDocument> = {};
      for (const [key, doc] of this.cache.entries()) {
        serialized[key] = doc;
      }

      await fs.promises.writeFile(
        this.filePath,
        JSON.stringify(serialized, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error(
        `[LocalFileMemoryStore] Failed to persist conversations to ${this.filePath}`,
        error
      );
    }
  }

  private schedulePersist(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persist();
      this.saveTimeout = null;
    }, 100);
  }

  async get(
    botId: string,
    channelId: string
  ): Promise<ConversationDocument | null> {
    await this.ensureLoaded();
    const key = this.getKey(botId, channelId);
    return this.cache.get(key) ?? null;
  }

  async set(
    botId: string,
    channelId: string,
    data: ConversationDocument
  ): Promise<void> {
    await this.ensureLoaded();
    const key = this.getKey(botId, channelId);
    this.cache.set(key, data);
    this.schedulePersist();
  }

  async delete(botId: string, channelId: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.getKey(botId, channelId);
    this.cache.delete(key);
    this.schedulePersist();
  }

  async clearAll(botId?: string): Promise<void> {
    await this.ensureLoaded();
    if (!botId) {
      this.cache.clear();
    } else {
      for (const [key, doc] of this.cache.entries()) {
        if (doc.botId === botId || key.startsWith(`${botId}_`)) {
          this.cache.delete(key);
        }
      }
    }
    this.schedulePersist();
  }
}
