import { configureStore } from "@reduxjs/toolkit";
import { createChatbotSlice } from "./features/chatbot";

const chatbotSlice = createChatbotSlice("chatbot");
const policeBotSlice = createChatbotSlice("policeBot");

export const chatbotActions = chatbotSlice.actions;
export const policeBotActions = policeBotSlice.actions;

export const store = configureStore({
  reducer: {
    chatbot: chatbotSlice.reducer,
    policeBot: policeBotSlice.reducer,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: { chatbot: ChatbotState }
export type AppDispatch = typeof store.dispatch;
