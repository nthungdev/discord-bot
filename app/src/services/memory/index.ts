import { Config, ConfigParameter } from "../../config";
import {
  AiChatMessage,
  ConversationDocument,
  StoredAiChatMessage,
  UserActorInfo,
} from "../../types";
import { FirestoreMemoryStore } from "./firestore-store";
import { LocalFileMemoryStore } from "./local-store";
import { IMemoryStore, MemoryStoreType } from "./types";

export function createMemoryStore(
  storeType?: MemoryStoreType,
  customPath?: string
): IMemoryStore {
  const envType = process.env.MEMORY_STORE_TYPE as MemoryStoreType | undefined;

  let configType: MemoryStoreType | undefined;
  try {
    configType = Config.getInstance().getConfigValue(
      ConfigParameter.memoryStoreType
    ) as MemoryStoreType;
  } catch {
    // Remote config might not be initialized yet
  }

  const selectedType: MemoryStoreType =
    storeType ||
    envType ||
    configType ||
    (process.env.NODE_ENV === "production" ? "firestore" : "local");

  console.info(`[MemoryService] Initializing memory store: ${selectedType}`);

  if (selectedType === "firestore") {
    return new FirestoreMemoryStore();
  }

  return new LocalFileMemoryStore(customPath);
}

export class ConversationMemoryService {
  private store: IMemoryStore;
  private inMemoryCache: Map<string, StoredAiChatMessage[]> = new Map();

  constructor(store?: IMemoryStore) {
    this.store = store || createMemoryStore();
  }

  /**
   * Reinitialize the underlying store if needed (e.g. after remote config load)
   */
  public setStore(store: IMemoryStore) {
    this.store = store;
  }

  private getKey(botId: string, channelId: string): string {
    return `${botId}_${channelId}`;
  }

  /**
   * Retrieves conversation history for a channel and bot instance.
   * Checks in-memory cache first, falls back to persistent store on cache miss.
   */
  async getHistory(
    botId: string,
    channelId: string
  ): Promise<AiChatMessage[]> {
    const key = this.getKey(botId, channelId);

    if (this.inMemoryCache.has(key)) {
      return this.inMemoryCache.get(key) || [];
    }

    try {
      const doc = await this.store.get(botId, channelId);
      if (doc && Array.isArray(doc.messages)) {
        this.inMemoryCache.set(key, doc.messages);
        return doc.messages;
      }
    } catch (error) {
      console.error(
        `[MemoryService] Error loading history for botId=${botId}, channelId=${channelId}`,
        error
      );
    }

    this.inMemoryCache.set(key, []);
    return [];
  }

  /**
   * Appends a user/bot dialogue turn, applies sliding window pruning,
   * updates in-memory cache, and asynchronously persists to the store.
   */
  async addTurn(
    botId: string,
    channelId: string,
    userMessage: string,
    botMessage: string,
    actor?: UserActorInfo,
    guildId?: string,
    botType?: string
  ): Promise<void> {
    const key = this.getKey(botId, channelId);

    // Ensure cache is populated
    await this.getHistory(botId, channelId);
    const existingMessages = this.inMemoryCache.get(key) || [];

    const now = Date.now();
    const userTurn: StoredAiChatMessage = {
      author: "user",
      content: userMessage,
      userId: actor?.userId,
      username: actor?.username,
      displayName: actor?.displayName,
      timestamp: now,
    };

    const botTurn: StoredAiChatMessage = {
      author: "bot",
      content: botMessage,
      timestamp: now,
    };

    let updatedMessages: StoredAiChatMessage[] = [
      ...existingMessages,
      userTurn,
      botTurn,
    ];

    // Determine max conversation history limit from Remote Config or fallback
    let maxHistory = 60;
    try {
      maxHistory =
        Config.getInstance().getConfigValue(
          ConfigParameter.aiMaxConversationHistory
        ) || 60;
    } catch {
      // Use fallback if remote config not ready
    }

    // Sliding window pruning (prune in even turn pairs)
    if (updatedMessages.length > maxHistory) {
      const excess = updatedMessages.length - maxHistory;
      const pruneCount = excess % 2 === 0 ? excess : excess + 1;
      updatedMessages = updatedMessages.slice(pruneCount);
    }

    this.inMemoryCache.set(key, updatedMessages);

    // Persist to store asynchronously
    const doc: ConversationDocument = {
      botId,
      botType,
      channelId,
      guildId,
      messages: updatedMessages,
      updatedAt: now,
    };

    this.store.set(botId, channelId, doc).catch((error) => {
      console.error(
        `[MemoryService] Failed to persist turn for botId=${botId}, channelId=${channelId}`,
        error
      );
    });
  }

  /**
   * Clears conversation history for a channel or all channels.
   */
  async clearHistory(botId?: string, channelId?: string): Promise<void> {
    if (botId && channelId) {
      const key = this.getKey(botId, channelId);
      this.inMemoryCache.delete(key);
      await this.store.delete(botId, channelId);
    } else if (botId) {
      for (const key of this.inMemoryCache.keys()) {
        if (key.startsWith(`${botId}_`)) {
          this.inMemoryCache.delete(key);
        }
      }
      await this.store.clearAll(botId);
    } else {
      this.inMemoryCache.clear();
      await this.store.clearAll();
    }
  }
}

export const memoryService = new ConversationMemoryService();
export * from "./types";
export * from "./local-store";
export * from "./firestore-store";
