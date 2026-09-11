import { isAxiosError } from "axios";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  type Guild,
  type Interaction,
  type Message,
  MessageType,
} from "discord.js";
import type { BotGuildConfig } from "../config/types";
import { parseCommands } from "../discord/helpers";
import { buildChatBotSystemInstruction } from "../genAi/helpers";
import { getAddresseeService } from "../services/addressee";
import { getMemoryService } from "../services/memory";
import { chatbotActions, store } from "../store";
import { getToolRegistry } from "../tools/registry";
import type { ToolDefinition, ToolExecutionContext } from "../tools/types";
import type {
  AiPrompt,
  AppCommand,
  DiscordMessage,
  DiscordUser,
  UserActorInfo,
} from "../types";
import { splitEndingEmojis } from "../utils/emoji";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";
import BaseBot, { type BaseBotConfig } from "./base-bot";

export const DEFAULT_DEBOUNCE_DELAY_MS = 3500;
export const DEFAULT_MAX_DEBOUNCE_DELAY_MS = 8000;
export const TYPING_REFRESH_INTERVAL_MS = 8000;
export const MEMBER_FETCH_AGE_MS = 24 * 60 * 60 * 1000; // 1 day in milliseconds
export const DEFAULT_AMBIENT_RATE_LIMIT_SECONDS = 120;
export const DEFAULT_SILENCE_MINUTES = 10;
export const DEFAULT_AMBIENT_SNAPSHOT_LIMIT = 5;

/** Fetch up-to-date member list to cache */
const validateServerMembersCache = async (guild: Guild): Promise<void> => {
  const { lastMemberFetch } = store.getState().chatbot;
  if (!lastMemberFetch || lastMemberFetch + MEMBER_FETCH_AGE_MS < Date.now()) {
    await guild.members.fetch();
    store.dispatch(
      chatbotActions.setLastMemberFetch(Date.now() + MEMBER_FETCH_AGE_MS),
    );
  }
};

export const DISMISSAL_PHRASES = [
  "not you bot",
  "shut up bot",
  "shh",
  "im not talking to you bot",
  "i'm not talking to you bot",
  "quiet bot",
  "stop talking bot",
  "shutup bot",
  "stfu bot",
  "be quiet bot",
];

export const DISMISSAL_REACTION_EMOJIS = ["🤫", "🛑"];

/** Keyed by `${channelId}:${userId}` */
const slidingTimers = new Map<string, NodeJS.Timeout>();
const ceilingTimers = new Map<string, NodeJS.Timeout>();
const lastAmbientResponseAt = new Map<string, number>();

/**
 * Checks if a string contains any dismissal phrase.
 */
export function isDismissalKeyword(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return DISMISSAL_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function getBatchKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export function clearBatchTimers(channelId: string, userId: string): void {
  const key = getBatchKey(channelId, userId);
  const sliding = slidingTimers.get(key);
  if (sliding) {
    clearTimeout(sliding);
    slidingTimers.delete(key);
  }
  const ceiling = ceilingTimers.get(key);
  if (ceiling) {
    clearTimeout(ceiling);
    ceilingTimers.delete(key);
  }
}

export function clearAllBatchTimers(): void {
  for (const timeout of slidingTimers.values()) {
    clearTimeout(timeout);
  }
  slidingTimers.clear();

  for (const timeout of ceilingTimers.values()) {
    clearTimeout(timeout);
  }
  ceilingTimers.clear();
}

/**
 * Formats buffered discord messages into prompt text.
 */
function buildPromptText(messages: DiscordMessage[]): string {
  const text = messages
    .map((message) => {
      const authorQuote = `${message.authorUsername} says ${message.cleanContent}`;
      if (message.reference) {
        return `In reply to @${message.reference.authorUsername} saying "${message.reference.cleanContent}", ${authorQuote}`;
      }
      return authorQuote;
    })
    .join("\n");

  const messageMentions = messages.flatMap((m) => m.mentions);
  return messageMentions.reduce((acc, mention) => {
    return acc.replaceAll(`@${mention.nickname}`, mention.nickname);
  }, text);
}

/**
 * Builds tool definitions and execution context for available bot tools.
 */
async function buildToolContext(
  botId: string,
  message: Message<boolean>,
  lastMessage: DiscordMessage,
): Promise<{ tools?: ToolDefinition[]; toolContext?: ToolExecutionContext }> {
  const toolContext: ToolExecutionContext = {
    botId,
    client: message.client,
    guild: message.guild,
    channel: message.channel,
    messageId: message.id,
    author: {
      id: lastMessage.authorId,
      username: lastMessage.authorUsername,
      displayName: lastMessage.authorDisplayName,
    },
  };
  const tools = await getToolRegistry().getAvailableTools(toolContext);
  return { tools, toolContext };
}

/**
 * Maps guild members to user actor info for mention translation.
 */
function buildGuildMemberInfoList(message: Message<boolean>): DiscordUser[] {
  return (
    message.guild?.members.cache.toJSON().map((m) => ({
      id: m.id,
      nickname: m.nickname ?? m.displayName,
      username: m.user.username,
    })) ?? []
  );
}

/**
 * Determines whether a message qualifies as high-certainty to trigger immediate typing feedback.
 */
function isHighCertaintyTrigger(
  message: Message<boolean>,
  botUserId?: string,
): boolean {
  if (!botUserId) return false;
  const users = message.mentions?.users;
  if (users) {
    if (typeof users.has === "function" && users.has(botUserId)) {
      return true;
    }
    if (
      typeof users.toJSON === "function" &&
      users.toJSON().some((u) => u.id === botUserId)
    ) {
      return true;
    }
  }
  if (
    typeof message.channel?.isThread === "function" &&
    message.channel.isThread() &&
    message.channel.ownerId === botUserId
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if a discord message meets the basic eligibility requirements for handling.
 */
function isMessageEligible(message: Message<boolean>): boolean {
  if (!message.channel.isSendable()) {
    return false;
  }
  if (message.author.bot || message.stickers.size !== 0) {
    return false;
  }
  if (![MessageType.Default, MessageType.Reply].includes(message.type)) {
    return false;
  }
  if (!message.inGuild()) {
    return false;
  }
  return true;
}

/**
 * Transforms Discord attachments into application format safely.
 */
function mapAttachments(
  attachments: Collection<string, { url: string; contentType: string | null }>,
) {
  return attachments
    .toJSON()
    .filter(
      (a): a is { url: string; contentType: string } => a.contentType !== null,
    )
    .map((a) => ({
      uri: a.url,
      mimeType: a.contentType,
    }));
}

/**
 * Converts a raw Discord message into our normalized DiscordMessage format.
 */
function parseDiscordMessage(
  message: Message<boolean>,
  refMessage: Message<boolean> | null,
  displayName: string,
): DiscordMessage {
  return {
    authorId: message.author.id,
    content: message.content,
    authorUsername: message.author.username,
    authorDisplayName: displayName,
    cleanContent: message.cleanContent,
    reference: !refMessage
      ? undefined
      : {
          authorUsername: refMessage.author.username,
          content: refMessage.content,
          cleanContent: refMessage.cleanContent,
          attachments: mapAttachments(refMessage.attachments),
        },
    mentions: message.mentions.users.toJSON().map((u) => ({
      id: u.id,
      nickname:
        message.guild?.members.cache.get(u.id)?.nickname ?? u.displayName,
      username: u.username,
    })),
    attachments: mapAttachments(message.attachments),
  };
}

/**
 * Fetches recent ambient channel messages before the trigger message for context grounding.
 */
export async function fetchAmbientChannelSnapshot(
  channel: Message<boolean>["channel"],
  beforeMessageId: string,
  limit: number = DEFAULT_AMBIENT_SNAPSHOT_LIMIT,
): Promise<string> {
  if (!channel.isTextBased() || limit <= 0) {
    return "";
  }
  try {
    const fetched = await channel.messages.fetch({
      limit,
      before: beforeMessageId,
    });
    if (fetched.size === 0) {
      return "";
    }
    const messages = fetched.toJSON().reverse();
    const formatted = messages
      .map((m) => {
        const time = m.createdAt.toISOString().substring(11, 19);
        const name =
          m.member?.nickname ?? m.author.displayName ?? m.author.username;
        return `[${time}] @${m.author.username} (${name}): "${m.cleanContent}"`;
      })
      .join("\n");
    return `--- Recent Channel Activity (for context reference only) ---\n${formatted}\n--- End Recent Channel Activity ---`;
  } catch {
    return "";
  }
}

/**
 * Dispatches the generated response using the configured reply strategy (hybrid reply default).
 */
async function dispatchBotReply(
  message: Message<boolean>,
  content: string,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  const [finalMessage, endingEmoji] = splitEndingEmojis(content);
  const textToSend = finalMessage || "?";
  const replyStrategy = guildConfig?.smartReply?.replyStrategy ?? "hybrid";

  if (replyStrategy === "coalesced" && message.channel.isSendable()) {
    await message.channel.send(textToSend);
  } else {
    try {
      await message.reply(textToSend);
    } catch {
      if (message.channel.isSendable()) {
        await message.channel.send(textToSend);
      }
    }
  }

  if (endingEmoji && message.channel.isSendable()) {
    await message.channel.sendTyping();
    await message.channel.send(endingEmoji);
  }
}

/**
 * Assembles the full prompt, attachments, history, and tools for the chat turn.
 */
async function preparePromptAndTools(
  message: Message<boolean>,
  messages: DiscordMessage[],
  botId: string,
  guildConfig?: BotGuildConfig,
): Promise<{
  prompt: AiPrompt;
  textWithUsername: string;
  lastMessage: DiscordMessage;
}> {
  const lastMessage = messages[messages.length - 1];
  const textWithUsername = buildPromptText(messages);

  const files = [
    ...messages.flatMap((m) => m.attachments),
    ...messages.flatMap((m) => m.reference?.attachments ?? []),
  ];

  const history = await getMemoryService().getHistory(botId, message.channelId);

  const ambientLimit =
    guildConfig?.smartReply?.ambientSnapshotLimit ??
    DEFAULT_AMBIENT_SNAPSHOT_LIMIT;
  const ambientSnapshot = await fetchAmbientChannelSnapshot(
    message.channel,
    message.id,
    ambientLimit,
  );

  const fullPromptText = ambientSnapshot
    ? `${ambientSnapshot}\n\n${textWithUsername}`
    : textWithUsername;

  const enableDiscordTools = Boolean(guildConfig?.tools?.discord);
  const enableGoogleSearch = Boolean(guildConfig?.tools?.googleSearch);

  let tools: ToolDefinition[] | undefined;
  let toolContext: ToolExecutionContext | undefined;

  if (enableDiscordTools) {
    const toolData = await buildToolContext(botId, message, lastMessage);
    tools = toolData.tools;
    toolContext = toolData.toolContext;
  }

  const prompt = {
    text: fullPromptText,
    files,
    history,
    tools,
    toolContext,
    enableGoogleSearch,
  } as AiPrompt;

  return { prompt, textWithUsername, lastMessage };
}

/**
 * Initializes GenAI with guild configuration and generates chatbot response.
 */
async function executeChatBotGeneration(
  message: Message<boolean>,
  prompt: AiPrompt,
  guildConfig?: BotGuildConfig,
): Promise<string> {
  const systemInstruction = guildConfig?.botName
    ? buildChatBotSystemInstruction({
        botName: guildConfig.botName,
        personalization:
          guildConfig.personalization ?? guildConfig.systemInstruction,
        mode: guildConfig.personalizationMode,
      })
    : guildConfig?.systemInstruction;

  const chatBotModelConfig =
    guildConfig?.smartReply?.chatBotModel ?? guildConfig?.chatBotModel;
  const modelId = chatBotModelConfig?.modelId;
  const maxOutputTokens = chatBotModelConfig?.maxOutputTokens;

  const genAi = getGenAi({
    apiKey: process.env.AI_API_KEY,
    guildId: message.guildId,
    systemInstruction,
    modelId,
    maxOutputTokens,
  });
  await genAi.init();
  const { content } = await generateChatMessageWithGenAi(
    genAi,
    prompt,
    buildGuildMemberInfoList(message),
    message.guild,
  );
  return content;
}

const handleUserBatchExecution = async (
  message: Message<boolean>,
  botId: string,
  guildConfig?: BotGuildConfig,
): Promise<void> => {
  const channelId = message.channelId;
  const userId = message.author.id;

  clearBatchTimers(channelId, userId);

  if (!message.channel.isSendable()) {
    return;
  }

  const sendableChannel = message.channel;
  const channelBatches = store.getState().chatbot.userMessageBatches[channelId];
  const userBatch = channelBatches?.[userId];

  if (!userBatch || userBatch.isProcessing || userBatch.messages.length === 0) {
    return;
  }

  store.dispatch(
    chatbotActions.setUserBatchProcessing({
      channelId,
      userId,
      isProcessing: true,
    }),
  );

  await sendableChannel.sendTyping();
  const typingInterval = setInterval(() => {
    sendableChannel.sendTyping().catch(() => {});
  }, TYPING_REFRESH_INTERVAL_MS);

  try {
    const { prompt, textWithUsername, lastMessage } =
      await preparePromptAndTools(
        message,
        userBatch.messages,
        botId,
        guildConfig,
      );

    try {
      console.info(
        `[SmartReply:Batch:Execute] Generating response for @${lastMessage.authorUsername} in channel ${channelId} (${userBatch.messages.length} message(s))`,
      );

      const content = await executeChatBotGeneration(
        message,
        prompt,
        guildConfig,
      );

      await dispatchBotReply(message, content, guildConfig);

      console.info(
        `[SmartReply:Reply:Dispatched] Reply sent via "${guildConfig?.smartReply?.replyStrategy ?? "hybrid"}" (${content?.length ?? 0} chars) to channel ${channelId}`,
      );

      const actor: UserActorInfo = {
        userId: lastMessage.authorId,
        username: lastMessage.authorUsername,
        displayName: lastMessage.authorDisplayName,
      };

      await getMemoryService().addTurn(
        botId,
        channelId,
        textWithUsername,
        content || "?",
        actor,
        message.guildId ?? undefined,
        "chatBot",
      );
    } catch (error) {
      console.error("Error generating chatbot response", error);
      if (isAxiosError(error)) {
        console.error({
          name: error.name,
          message: error.message,
          error: error.toJSON(),
        });
      }
    } finally {
      store.dispatch(chatbotActions.clearUserBatch({ channelId, userId }));
    }
  } catch (error: unknown) {
    console.error("Error handleUserBatchExecution", error);
    store.dispatch(chatbotActions.clearUserBatch({ channelId, userId }));
  } finally {
    clearInterval(typingInterval);
  }
};

/**
 * Handles keyword-based annoyance dismissal ("not you bot", "shh", etc.).
 */
function handleKeywordDismissal(
  message: Message<boolean>,
  channelId: string,
  guildConfig?: BotGuildConfig,
): boolean {
  if (
    guildConfig?.smartReply?.enableKeywordDismissal === false ||
    !isDismissalKeyword(message.cleanContent)
  ) {
    return false;
  }

  const silenceMinutes =
    guildConfig?.smartReply?.silenceDurationMinutes ?? DEFAULT_SILENCE_MINUTES;
  console.info(
    `[SmartReply:Annoyance] Silencing channel ${channelId} for ${silenceMinutes}m due to keyword dismissal ("${message.cleanContent}")`,
  );
  store.dispatch(
    chatbotActions.silenceChannel({
      channelId,
      durationMinutes: silenceMinutes,
    }),
  );

  if (guildConfig?.smartReply?.enableReactionDismissal !== false) {
    message.react("🤫").catch(() => {});
  }
  return true;
}

/**
 * Determines whether an ambient reply is throttled by the channel rate limit.
 */
function isAmbientRateThrottled(
  channelId: string,
  guildConfig?: BotGuildConfig,
): boolean {
  const rateLimitSeconds =
    guildConfig?.smartReply?.ambientRateLimitSeconds ??
    DEFAULT_AMBIENT_RATE_LIMIT_SECONDS;
  const lastAmbientTime = lastAmbientResponseAt.get(channelId) ?? 0;
  const now = Date.now();

  if (now - lastAmbientTime < rateLimitSeconds * 1000) {
    console.info(
      `[SmartReply:RateLimit] Throttled ambient reply in channel ${channelId} (${rateLimitSeconds}s rate limit active, ${Math.round((now - lastAmbientTime) / 1000)}s elapsed)`,
    );
    return true;
  }

  lastAmbientResponseAt.set(channelId, now);
  return false;
}

/**
 * Schedules per-user sliding debounce and upper ceiling timers.
 */
function scheduleDebounceTimers(
  channelId: string,
  userId: string,
  replyDelay: number,
  maxDebounceDelay: number,
  executeBatch: () => void,
): void {
  const key = getBatchKey(channelId, userId);

  const existingSliding = slidingTimers.get(key);
  if (existingSliding) {
    clearTimeout(existingSliding);
  }
  console.info(
    `[SmartReply:Debounce] Scheduled batch timer for user ${userId} in channel ${channelId} (sliding: ${replyDelay}ms, ceiling: ${maxDebounceDelay}ms)`,
  );
  slidingTimers.set(key, setTimeout(executeBatch, replyDelay));

  if (!ceilingTimers.has(key)) {
    ceilingTimers.set(key, setTimeout(executeBatch, maxDebounceDelay));
  }
}

export default class ChatBot extends BaseBot {
  protected client: Client;
  config: BaseBotConfig;
  private commands = new Collection<string, AppCommand>();

  constructor(config: BaseBotConfig) {
    super(config);
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
    this.handleNewMessage = this.handleNewMessage.bind(this);
    this.listenToReactions();
  }

  listenToReactions(): void {
    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;
      const emojiName = reaction.emoji.name ?? "";
      if (!DISMISSAL_REACTION_EMOJIS.includes(emojiName)) {
        return;
      }

      const channelId = reaction.message.channelId;
      const guildId = reaction.message.guildId;
      const guildConfig = this.getGuildConfig(guildId);

      if (guildConfig?.smartReply?.enableReactionDismissal === false) {
        return;
      }

      const silenceMinutes =
        guildConfig?.smartReply?.silenceDurationMinutes ??
        DEFAULT_SILENCE_MINUTES;
      console.info(
        `[SmartReply:Annoyance] Silencing channel ${channelId} for ${silenceMinutes}m due to reaction dismissal (${emojiName}) by user ${user.id}`,
      );
      store.dispatch(
        chatbotActions.silenceChannel({
          channelId,
          durationMinutes: silenceMinutes,
        }),
      );
    });
  }

  async loadCommands(): Promise<void> {
    const commandsToReg = await parseCommands();
    commandsToReg.forEach((command) => {
      this.commands.set(command.data.name, command);
    });
    console.log(`Loaded ${this.commands.size} commands.`);
  }

  protected async handleNewInteraction(
    interaction: Interaction,
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    try {
      await (command as AppCommand).execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      }
    }
  }

  protected async handleNewMessage(message: Message<boolean>): Promise<void> {
    if (!isMessageEligible(message)) {
      return;
    }

    const channelId = message.channelId;
    const userId = message.author.id;
    const guildConfig = this.getGuildConfig(message.guildId);

    if (handleKeywordDismissal(message, channelId, guildConfig)) {
      return;
    }

    let refMessage: Message<boolean> | null = null;
    if (message.reference?.messageId) {
      refMessage = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
    }

    const channelSilencedUntil =
      store.getState().chatbot.channelSilenceCooldowns[channelId];
    const activeSessionTimestamp =
      store.getState().chatbot.activeUserSessions[channelId]?.[userId];

    const addresseeDecision = await getAddresseeService().resolveAddressee({
      message,
      botUserId: this.client.user?.id ?? "",
      botName: guildConfig?.botName,
      guildConfig,
      refMessage,
      activeSessionTimestamp,
      channelSilencedUntil,
    });

    if (addresseeDecision.decision === "ignore") {
      return;
    }

    if (
      addresseeDecision.tier === "tier2_classifier" &&
      isAmbientRateThrottled(channelId, guildConfig)
    ) {
      return;
    }

    if (message.guild) {
      await validateServerMembersCache(message.guild);
    }

    const guildMember = message.guild?.members.cache.get(message.author.id);
    const authorDisplayName =
      guildMember?.nickname ?? message.author.displayName;
    const discordMessage = parseDiscordMessage(
      message,
      refMessage,
      authorDisplayName,
    );

    store.dispatch(
      chatbotActions.appendUserMessage({
        channelId,
        userId,
        authorUsername: message.author.username,
        authorDisplayName,
        message: discordMessage,
      }),
    );
    store.dispatch(
      chatbotActions.recordUserActivity({
        channelId,
        userId,
      }),
    );

    if (
      isHighCertaintyTrigger(message, this.client.user?.id) &&
      message.channel.isSendable()
    ) {
      message.channel.sendTyping().catch(() => {});
    }

    const replyDelay =
      guildConfig?.replyDelay ??
      guildConfig?.smartReply?.debounceMs ??
      DEFAULT_DEBOUNCE_DELAY_MS;
    const maxDebounceDelay =
      guildConfig?.smartReply?.maxDebounceMs ?? DEFAULT_MAX_DEBOUNCE_DELAY_MS;

    scheduleDebounceTimers(
      channelId,
      userId,
      replyDelay,
      maxDebounceDelay,
      () => handleUserBatchExecution(message, this.id, guildConfig),
    );
  }
}
