import type { Client, Interaction, Message } from "discord.js";
import ChatBot from "../bots/chat-bot";
import type { Config } from "../config";
import type { BotGuildConfig } from "../config/types";
import type { IBotCapability } from "./types";

/**
 * Chat Capability (Conversational AI Engine)
 * Encapsulates multimodal Gemini inference, Smart Reply intent resolution,
 * multi-user context memory, typing indicators, and tool dispatch.
 */
export class ChatCapability implements IBotCapability {
  readonly id = "chat";
  readonly name = "Conversational AI Engine";
  private chatBot: ChatBot | null = null;

  async init(client: Client, _config: Config): Promise<void> {
    this.chatBot = new ChatBot(
      {
        id: "chatBot",
        token: process.env.DISCORD_TOKEN || "",
        botConfig: { guilds: {} },
      },
      client,
    );
    await this.chatBot.loadCommands();
    console.info("[ChatCapability] Initialized.");
  }

  async handleMessage(
    message: Message,
    guildConfig?: BotGuildConfig,
  ): Promise<boolean | undefined> {
    if (this.chatBot) {
      await this.chatBot.handleNewMessage(message, guildConfig);
    }
    return undefined;
  }

  async handleInteraction(
    interaction: Interaction,
    _guildConfig?: BotGuildConfig,
  ): Promise<void> {
    if (this.chatBot) {
      await this.chatBot.handleNewInteraction(interaction);
    }
  }

  destroy(): void {
    if (this.chatBot) {
      this.chatBot.destroy();
      this.chatBot = null;
    }
  }
}
