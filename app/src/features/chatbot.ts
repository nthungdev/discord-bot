import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../../src/store";
import type { AiChatMessage, DiscordMessage } from "../types";

export const DEFAULT_SILENCE_DURATION_MINUTES = 10;
export const MAX_STORED_HISTORY_LENGTH = 40;
export const PRUNED_HISTORY_LENGTH = 14;

export interface UserPendingBatch {
  userId: string;
  authorUsername: string;
  authorDisplayName: string;
  messages: DiscordMessage[];
  firstMessageTimestamp: number;
  lastMessageTimestamp: number;
  isProcessing: boolean;
}

export interface ChatbotState {
  /** Key is channel id -> list of conversation turns */
  messageHistory: Record<string, AiChatMessage[]>;
  /** Keyed by channelId -> userId -> UserPendingBatch */
  userMessageBatches: Record<string, Record<string, UserPendingBatch>>;
  /** Active conversational session timestamps: channelId -> userId -> lastInteractionTimestamp */
  activeUserSessions: Record<string, Record<string, number>>;
  /** Channel silence cooldown expiry: channelId -> expiryTimestamp */
  channelSilenceCooldowns: Record<string, number>;
  lastMemberFetch?: number;
}

const initialState: ChatbotState = {
  messageHistory: {},
  userMessageBatches: {},
  activeUserSessions: {},
  channelSilenceCooldowns: {},
};

export function createChatbotSlice(sliceName: string) {
  return createSlice({
    name: sliceName,
    initialState,
    reducers: {
      /** Clear all history if missing channelId, else clear for a specific channel */
      clearMessageHistory: (
        state,
        action: PayloadAction<{
          channelId?: string;
        }>,
      ) => {
        if (action.payload.channelId) {
          state.messageHistory[action.payload.channelId] = [];
        } else {
          state.messageHistory = {};
        }
      },

      /** Appends a message to a user-specific pending batch in a given channel */
      appendUserMessage: (
        state,
        action: PayloadAction<{
          channelId: string;
          userId: string;
          authorUsername: string;
          authorDisplayName: string;
          message: DiscordMessage;
          timestamp?: number;
        }>,
      ) => {
        const {
          channelId,
          userId,
          authorUsername,
          authorDisplayName,
          message,
          timestamp = Date.now(),
        } = action.payload;

        if (!state.userMessageBatches[channelId]) {
          state.userMessageBatches[channelId] = {};
        }

        const channelBatches = state.userMessageBatches[channelId];
        const existingBatch = channelBatches[userId];

        if (existingBatch) {
          existingBatch.messages.push(message);
          existingBatch.lastMessageTimestamp = timestamp;
          existingBatch.authorUsername = authorUsername;
          existingBatch.authorDisplayName = authorDisplayName;
        } else {
          channelBatches[userId] = {
            userId,
            authorUsername,
            authorDisplayName,
            messages: [message],
            firstMessageTimestamp: timestamp,
            lastMessageTimestamp: timestamp,
            isProcessing: false,
          };
        }
      },

      /** Clears the pending batch for a specific user in a channel */
      clearUserBatch: (
        state,
        action: PayloadAction<{
          channelId: string;
          userId: string;
        }>,
      ) => {
        const { channelId, userId } = action.payload;
        if (state.userMessageBatches[channelId]) {
          delete state.userMessageBatches[channelId][userId];
        }
      },

      /** Clears all pending batches across all users in a specific channel */
      clearChannelBatches: (state, action: PayloadAction<string>) => {
        delete state.userMessageBatches[action.payload];
      },

      /** Sets the processing state flag for a user batch */
      setUserBatchProcessing: (
        state,
        action: PayloadAction<{
          channelId: string;
          userId: string;
          isProcessing: boolean;
        }>,
      ) => {
        const { channelId, userId, isProcessing } = action.payload;
        const batch = state.userMessageBatches[channelId]?.[userId];
        if (batch) {
          batch.isProcessing = isProcessing;
        }
      },

      /** Records the latest activity timestamp for a user in a channel */
      recordUserActivity: (
        state,
        action: PayloadAction<{
          channelId: string;
          userId: string;
          timestamp?: number;
        }>,
      ) => {
        const { channelId, userId, timestamp = Date.now() } = action.payload;

        if (!state.activeUserSessions[channelId]) {
          state.activeUserSessions[channelId] = {};
        }
        state.activeUserSessions[channelId][userId] = timestamp;
      },

      /** Activates a silence / snooze cooldown for a specific channel */
      silenceChannel: (
        state,
        action: PayloadAction<{
          channelId: string;
          durationMinutes?: number;
          untilTimestamp?: number;
        }>,
      ) => {
        const { channelId, durationMinutes, untilTimestamp } = action.payload;
        if (untilTimestamp !== undefined) {
          state.channelSilenceCooldowns[channelId] = untilTimestamp;
          return;
        }

        const durationMs =
          (durationMinutes ?? DEFAULT_SILENCE_DURATION_MINUTES) * 60 * 1000;
        state.channelSilenceCooldowns[channelId] = Date.now() + durationMs;
      },

      /** Removes a silence cooldown from a specific channel */
      clearChannelSilence: (state, action: PayloadAction<string>) => {
        delete state.channelSilenceCooldowns[action.payload];
      },

      /** Prunes expired silence cooldowns */
      clearExpiredCooldowns: (
        state,
        action: PayloadAction<{ now?: number } | undefined>,
      ) => {
        const now = action?.payload?.now ?? Date.now();
        for (const [channelId, expiry] of Object.entries(
          state.channelSilenceCooldowns,
        )) {
          if (expiry <= now) {
            delete state.channelSilenceCooldowns[channelId];
          }
        }
      },

      /** Clear all state */
      clearAll: (state) => {
        state.messageHistory = {};
        state.userMessageBatches = {};
        state.activeUserSessions = {};
        state.channelSilenceCooldowns = {};
      },

      addMessageHistory: (
        state,
        action: PayloadAction<{
          userMessage: string;
          botMessage: string;
          channelId: string;
        }>,
      ) => {
        const { channelId, botMessage, userMessage } = action.payload;

        if (channelId in state.messageHistory) {
          state.messageHistory[channelId] = state.messageHistory[
            channelId
          ].concat([
            { author: "user", content: userMessage },
            { author: "bot", content: botMessage },
          ]);
        } else {
          state.messageHistory[channelId] = [
            { author: "user", content: userMessage },
            { author: "bot", content: botMessage },
          ];
        }

        if (
          state.messageHistory[channelId].length > MAX_STORED_HISTORY_LENGTH
        ) {
          state.messageHistory[channelId] = state.messageHistory[
            channelId
          ].slice(-PRUNED_HISTORY_LENGTH);
        }
      },

      reduceMessageHistory: (
        state,
        action: PayloadAction<{
          /** must be an even number */
          by: number;
          channelId: string;
        }>,
      ) => {
        const { channelId, by } = action.payload;
        if (by % 2 !== 0) return;
        state.messageHistory[channelId] = state.messageHistory[channelId].slice(
          -by,
        );
      },

      setLastMemberFetch: (state, action: PayloadAction<number>) => {
        state.lastMemberFetch = action.payload;
      },
    },
  });
}

export const selectChatbotState = (state: RootState) => state.chatbot;
