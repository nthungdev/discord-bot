import fs from "node:fs/promises";
import path from "node:path";
import type {
  IBotRegistryStore,
  RegisteredBotRecord,
} from "../../shared/types/bot-registry";

export class LocalFileBotRegistryStore implements IBotRegistryStore {
  private filePath: string;
  private cache: Map<string, RegisteredBotRecord> = new Map();
  private isLoaded = false;

  constructor(customPath?: string) {
    this.filePath =
      customPath ||
      path.resolve(process.cwd(), ".data", "registered-bots.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const records: RegisteredBotRecord[] = JSON.parse(content);
      this.cache.clear();
      for (const record of records) {
        this.cache.set(record.id, record);
      }
    } catch {
      // File doesn't exist yet or invalid JSON, initialize empty cache
      this.cache.clear();
    }
    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const records = Array.from(this.cache.values());
    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(records, null, 2), "utf-8");
    await fs.rename(tempFile, this.filePath);
  }

  async get(id: string): Promise<RegisteredBotRecord | null> {
    await this.ensureLoaded();
    return this.cache.get(id) || null;
  }

  async getAll(): Promise<RegisteredBotRecord[]> {
    await this.ensureLoaded();
    return Array.from(this.cache.values());
  }

  async save(bot: RegisteredBotRecord): Promise<void> {
    await this.ensureLoaded();
    this.cache.set(bot.id, bot);
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.cache.has(id)) {
      this.cache.delete(id);
      await this.persist();
    }
  }
}
