import { Message } from "discord.js"
import { HistoryMessage } from "./types"
import { clearTimeout } from "timers"

let history: Record<string, HistoryMessage[]> = {}
let messageBuffer: Record<string, Message<boolean>[]> = {}
let messageTimeout: Record<string, NodeJS.Timeout> = {}

const clear = () => {
  for (const channelId in messageBuffer) {
    messageBuffer[channelId] = []
  }

  for (const channelId in messageTimeout) {
    clearTimeout(messageTimeout[channelId])
  }

  for (const channelId in history) {
    history[channelId] = []
  }
}

export { messageBuffer, messageTimeout, history, clear }