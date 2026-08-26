import * as admin from "firebase-admin";
import { ConversationDocument } from "../../types";
import { IMemoryStore } from "./types";

export class FirestoreMemoryStore implements IMemoryStore {
  private collectionName: string;

  constructor(collectionName = "conversations") {
    this.collectionName = collectionName;
  }

  private getCollection() {
    return admin.firestore().collection(this.collectionName);
  }

  private getDocId(botId: string, channelId: string): string {
    return `${botId}_${channelId}`;
  }

  async get(
    botId: string,
    channelId: string
  ): Promise<ConversationDocument | null> {
    try {
      const docId = this.getDocId(botId, channelId);
      const snapshot = await this.getCollection().doc(docId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as ConversationDocument;
      return data;
    } catch (error) {
      console.error(
        `[FirestoreMemoryStore] Error fetching conversation for botId=${botId}, channelId=${channelId}:`,
        error
      );
      return null;
    }
  }

  async set(
    botId: string,
    channelId: string,
    data: ConversationDocument
  ): Promise<void> {
    try {
      const docId = this.getDocId(botId, channelId);
      await this.getCollection()
        .doc(docId)
        .set(
          {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (error) {
      console.error(
        `[FirestoreMemoryStore] Error saving conversation for botId=${botId}, channelId=${channelId}:`,
        error
      );
    }
  }

  async delete(botId: string, channelId: string): Promise<void> {
    try {
      const docId = this.getDocId(botId, channelId);
      await this.getCollection().doc(docId).delete();
    } catch (error) {
      console.error(
        `[FirestoreMemoryStore] Error deleting conversation for botId=${botId}, channelId=${channelId}:`,
        error
      );
    }
  }

  async clearAll(botId?: string): Promise<void> {
    try {
      const collection = this.getCollection();
      const query = botId
        ? collection.where("botId", "==", botId)
        : collection;

      const snapshot = await query.get();
      const batch = admin.firestore().batch();

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    } catch (error) {
      console.error(
        `[FirestoreMemoryStore] Error clearing conversations for botId=${botId}:`,
        error
      );
    }
  }
}
