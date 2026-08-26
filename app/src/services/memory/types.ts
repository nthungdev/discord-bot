import { ConversationDocument } from "../../types";

export type MemoryStoreType = "local" | "firestore";

export interface IMemoryStore {
  /**
   * Retrieve a conversation document by botId and channelId.
   */
  get(botId: string, channelId: string): Promise<ConversationDocument | null>;

  /**
   * Save or overwrite a conversation document.
   */
  set(
    botId: string,
    channelId: string,
    data: ConversationDocument
  ): Promise<void>;

  /**
   * Delete conversation document for a specific channel.
   */
  delete(botId: string, channelId: string): Promise<void>;

  /**
   * Clear all conversation documents, optionally filtered by botId.
   */
  clearAll(botId?: string): Promise<void>;
}
