import { vi } from "vitest";
import {
  MessageType,
  type Client,
  type Guild,
  type Message,
  type TextChannel,
  type User,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";

export const createMockUser = (overrides?: Record<string, unknown>): User => {
  return {
    id: "user-123",
    username: "testuser",
    displayName: "Test User",
    bot: false,
    tag: "testuser#0001",
    ...overrides,
  } as unknown as User;
};

export const createMockGuild = (overrides?: Record<string, unknown>): Guild => {
  const memberMap = new Map();
  memberMap.set("user-123", {
    id: "user-123",
    nickname: "Test User",
    displayName: "Test User",
    user: createMockUser(),
  });

  return {
    id: "guild-123",
    name: "Test Guild",
    emojis: {
      cache: new Map(),
    },
    channels: {
      cache: new Map(),
    },
    members: {
      cache: memberMap,
      fetch: vi.fn().mockResolvedValue(memberMap),
    },
    ...overrides,
  } as unknown as Guild;
};

export const createMockChannel = (
  overrides?: Record<string, unknown>,
): TextChannel => {
  return {
    id: "channel-123",
    name: "general",
    isSendable: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue({}),
    sendTyping: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as TextChannel;
};

export const createMockMessage = (
  overrides?: Record<string, unknown>,
): Message => {
  const author = (overrides?.author as User) || createMockUser();
  const channel = (overrides?.channel as TextChannel) || createMockChannel();
  const guild = (overrides?.guild as Guild) || createMockGuild();

  return {
    id: "message-123",
    content: "hello bot",
    cleanContent: "hello bot",
    author,
    channel,
    guild,
    guildId: guild.id,
    channelId: channel.id,
    type: MessageType.Default,
    stickers: new Map(),
    attachments: {
      size: 0,
      toJSON: () => [],
    },
    reference: null,
    inGuild: vi.fn().mockReturnValue(true),
    mentions: {
      users: {
        toJSON: () => [],
      },
      roles: new Map(),
      everyone: false,
      members: new Map(),
    },
    reply: vi.fn().mockResolvedValue({}),
    react: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Message;
};

export const createMockInteraction = (
  overrides?: Record<string, unknown>,
): ChatInputCommandInteraction => {
  const user = (overrides?.user as User) || createMockUser();
  const guild = (overrides?.guild as Guild) || createMockGuild();
  const channel = (overrides?.channel as TextChannel) || createMockChannel();
  const member =
    (overrides?.member as GuildMember) ||
    ({ id: user.id, user } as GuildMember);

  return {
    id: "interaction-123",
    commandName: "ping",
    user,
    member,
    guild,
    guildId: guild.id,
    channel,
    channelId: channel.id,
    isChatInputCommand: vi.fn().mockReturnValue(true),
    reply: vi.fn().mockResolvedValue({}),
    deferReply: vi.fn().mockResolvedValue({}),
    editReply: vi.fn().mockResolvedValue({}),
    followUp: vi.fn().mockResolvedValue({}),
    options: {
      getString: vi.fn().mockReturnValue(null),
      getInteger: vi.fn().mockReturnValue(null),
      getUser: vi.fn().mockReturnValue(null),
      getMember: vi.fn().mockReturnValue(null),
    },
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
};

export const createMockClient = (
  overrides?: Record<string, unknown>,
): Client => {
  const user = createMockUser({ id: "bot-123", username: "TestBot", bot: true });
  return {
    user,
    channels: {
      cache: new Map(),
    },
    guilds: {
      cache: new Map(),
    },
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    login: vi.fn().mockResolvedValue("token"),
    ...overrides,
  } as unknown as Client;
};
