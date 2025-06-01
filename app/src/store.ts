import { configureStore } from "@reduxjs/toolkit";
import chatbot from "./features/chatbot";

export const store = configureStore({
  reducer: {
    chatbot,
  },
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: { chatbot: ChatbotState }
export type AppDispatch = typeof store.dispatch;
