import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../../src/store";
import { AiChatMessage, DiscordMessage } from "../types";

// Define a type for the slice state
export interface ChatbotState {
  /** key is channel id */
  messageHistory: Record<string, AiChatMessage[]>;
  /** key is channel id */
  messageBuffer: Record<string, DiscordMessage[]>;
  lastMemberFetch?: number;
}

// Define the initial state using that type
const initialState: ChatbotState = {
  messageHistory: {},
  messageBuffer: {},
};

export const chatbotSlice = createSlice({
  name: "chatbot",
  // `createSlice` will infer the state type from the `initialState` argument
  initialState,
  reducers: {
    /** Clear all if missing channelId, else, clear for a specific channel */
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
    clearMessageBuffer: (state, action: PayloadAction<string>) => {
      state.messageBuffer[action.payload] = [];
    },
    clearAll: (state) => {
      state.messageHistory = {};
      state.messageBuffer = {};
    },

    addMessageBuffer: (
      state,
      action: PayloadAction<{
        message: DiscordMessage;
        channelId: string;
      }>,
    ) => {
      const { channelId, message } = action.payload;
      if (channelId in state.messageBuffer) {
        state.messageBuffer[channelId].push(message);
      } else {
        state.messageBuffer[channelId] = [message];
      }
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

      // TODO verify the AI API limit, increase the 40 threshold if needed
      // auto cut down message history
      if (state.messageHistory[channelId].length > 40) {
        state.messageHistory[channelId] =
          state.messageHistory[channelId].slice(-14);
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
      state.messageHistory[channelId] =
        state.messageHistory[channelId].slice(-by);
    },
    setLastMemberFetch: (state, action: PayloadAction<number>) => {
      state.lastMemberFetch = action.payload;
    },
  },
});

export const selectMessageHistory = (state: RootState) =>
  state.chatbot.messageHistory;
export const selectMessageBuffer = (state: RootState) =>
  state.chatbot.messageBuffer;
export const selectChatbotState = (state: RootState) => state.chatbot;

export const {
  addMessageHistory,
  addMessageBuffer,
  clearAll,
  clearMessageHistory,
  clearMessageBuffer,
  reduceMessageHistory,
  setLastMemberFetch,
} = chatbotSlice.actions;

export default chatbotSlice.reducer;
