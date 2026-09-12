import * as admin from "firebase-admin";
import type {
  IBotRegistryStore,
  RegisteredBotRecord,
} from "../../shared/types/bot-registry";

export class FirestoreBotRegistryStore implements IBotRegistryStore {
  private collectionName = "bot_registry";

  private getDb(): admin.firestore.Firestore {
    return admin.firestore();
  }

  async get(id: string): Promise<RegisteredBotRecord | null> {
    try {
      const doc = await this.getDb()
        .collection(this.collectionName)
        .doc(id)
        .get();
      if (!doc.exists) {
        return null;
      }
      return doc.data() as RegisteredBotRecord;
    } catch (error) {
      console.error(
        `[FirestoreBotRegistryStore] Error fetching bot ${id}:`,
        error,
      );
      return null;
    }
  }

  async getAll(): Promise<RegisteredBotRecord[]> {
    try {
      const snapshot = await this.getDb().collection(this.collectionName).get();
      return snapshot.docs.map((doc) => doc.data() as RegisteredBotRecord);
    } catch (error) {
      console.error(
        "[FirestoreBotRegistryStore] Error fetching all bots:",
        error,
      );
      return [];
    }
  }

  async save(bot: RegisteredBotRecord): Promise<void> {
    await this.getDb()
      .collection(this.collectionName)
      .doc(bot.id)
      .set(bot, { merge: true });
  }

  async delete(id: string): Promise<void> {
    await this.getDb().collection(this.collectionName).doc(id).delete();
  }
}
