import { describe, it, expect, vi, beforeEach } from "vitest";
import { FirestoreMemoryStore } from "./firestore-store";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockBatchCommit = vi.fn();
const mockBatchDelete = vi.fn();

vi.mock("firebase-admin", () => ({
  firestore: Object.assign(
    () => ({
      collection: () => ({
        doc: () => ({
          get: mockGet,
          set: mockSet,
          delete: mockDelete,
        }),
        where: () => ({
          get: vi.fn().mockResolvedValue({
            docs: [{ ref: "doc-ref-1" }],
          }),
        }),
      }),
      batch: () => ({
        delete: mockBatchDelete,
        commit: mockBatchCommit,
      }),
    }),
    {
      FieldValue: {
        serverTimestamp: () => "mock-timestamp",
      },
    },
  ),
}));

describe("FirestoreMemoryStore", () => {
  let store: FirestoreMemoryStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new FirestoreMemoryStore("test_conversations");
  });

  it("should return null if document does not exist", async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    const result = await store.get("bot1", "channel1");
    expect(result).toBeNull();
  });

  it("should return document data if document exists", async () => {
    const docData = { botId: "bot1", channelId: "channel1", messages: [] };
    mockGet.mockResolvedValueOnce({ exists: true, data: () => docData });

    const result = await store.get("bot1", "channel1");
    expect(result).toEqual(docData);
  });

  it("should call set with server timestamp", async () => {
    mockSet.mockResolvedValueOnce({});
    await store.set("bot1", "channel1", {
      botId: "bot1",
      channelId: "channel1",
      messages: [],
      updatedAt: 123,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot1",
        channelId: "channel1",
        updatedAt: "mock-timestamp",
      }),
      { merge: true },
    );
  });

  it("should call delete on document", async () => {
    mockDelete.mockResolvedValueOnce({});
    await store.delete("bot1", "channel1");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("should batch delete in clearAll", async () => {
    mockBatchCommit.mockResolvedValueOnce({});
    await store.clearAll("bot1");
    expect(mockBatchDelete).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});
