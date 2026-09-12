# Design Document: System Architecture & Modular Bot Engine

**Author**: Hung Nguyen  
**Status**: Proposed Architecture & Implementation Plan  
**Target Platform**: `discord-bot` (Node.js 22, TypeScript 5, Discord.js v14, Google GenAI / Gemini, Express 4, React 19, Tailwind CSS, Biome, Vitest)  
**Date**: 2026-09-12  

---

## 1. System Overview & Architectural Vision

The `discord-bot` platform is an enterprise-grade, extensible Discord bot and management solution. It consolidates Discord bot interactions into a **single unified Discord Bot Engine** that maintains a persistent Gateway connection, serves multiple Discord servers (guilds) concurrently, and exposes a real-time web management portal for server administrators.

```mermaid
flowchart TD
    subgraph DiscordCloud [Discord Ecosystem]
        Gateway[Discord Gateway WebSocket]
        User[Discord Server Admin / Member]
        GuildA[Discord Server Alpha]
        GuildB[Discord Server Beta]
    end

    subgraph BotEngineCore [Unified Bot Engine]
        Client[Discord.js Client]
        Pipeline[Event Dispatch Pipeline]
        CapPolice[PoliceModerationCapability]
        CapChat[ChatBotCapability]
        CapVoice[VoiceBouncerCapability]
    end

    subgraph ManagementBackend [Express REST & Telemetry Server]
        AuthRouter[/api/v1/auth - OAuth2 SSO]
        GuildRouter[/api/v1/guilds - Per-Server Config]
        ConfigService[Config Service / Remote Config]
        MemoryService[Conversation Memory Service]
        SSEStream[SSE Real-time Telemetry Stream]
    end

    subgraph WebPortalApp [Vite + React 19 Management Portal]
        UIPortal[Admin Management Dashboard]
    end

    User -->|1. OAuth2 Login| AuthRouter
    User -->|2. Bot Invite URL| GuildB
    Client <-->|Gateway Events| Gateway
    Gateway <--> GuildA
    Gateway <--> GuildB
    
    Client --> Pipeline
    Pipeline -->|1. Intercept & Moderate| CapPolice
    Pipeline -->|2. Conversational AI| CapChat
    Pipeline -->|3. Voice Events| CapVoice

    UIPortal <-->|Manage Server Settings| GuildRouter
    GuildRouter <--> ConfigService
    ConfigService -.->|Live Reload| Pipeline
    SSEStream -.->|Telemetry & Logs| UIPortal
```

---

## 2. Core Architectural Decisions

### 2.1 Single Bot Engine vs. Multi-Bot Process Vault

| Criterion | Legacy Multi-Bot Process Model | Unified Bot Engine (Selected) |
|---|---|---|
| **Bot Instances** | Multiple distinct bot processes spawned dynamically. | 1 unified, resilient `BotEngine` instance connected to Discord Gateway. |
| **Token Management** | AES-256-GCM encrypted tokens in file/database vault. | Single unified `DISCORD_TOKEN` in environment variables. |
| **Failure Modes** | Decryption failures (`Unsupported state`), token sync races. | Predictable startup, single connection lifecycle. |
| **Server Presence** | Fragmented across separate bot users. | Single bot user joins multiple servers via standard OAuth2 invite URL. |


---

### 2.2 Capability Architecture: Interface & Composition vs. TypeScript Mixins

To keep the capabilities of **ChatBot** (conversational AI, multimodal Gemini inference, memory, smart reply) and **PoliceBot** (censorship, moderation, audit logging) strictly separated and maintainable, we analyzed two architectural patterns:

#### Option A: TypeScript Mixins (`class UnifiedBot extends PoliceMixin(ChatMixin(BaseBot))`)
- *Characteristics*: Combines methods onto a single class prototype using factory functions.
- *Weaknesses*:
  - Mixin constructors in TypeScript require verbose, fragile typing (`type Constructor<T = {}> = new (...args: any[]) => T`).
  - Namespace and property collision risks on `this`.
  - Tight coupling: Difficult to unit test moderation rules without instantiating conversational AI logic.
  - No clear execution pipeline: Event handlers on `this` cannot cleanly intercept and halt event propagation.

#### Option B: Interface & Capability Composition (Selected Architecture)
- *Characteristics*: Define an explicit `IBotCapability` contract. The `BotEngine` maintains an ordered pipeline of capability handlers.
- *Benefits*:
  - **Single Responsibility Principle**: Each capability lives in its own dedicated, cohesive module.
  - **Sequential Pipeline Interception**: `PoliceModerationCapability` inspects incoming messages first. If a message contains severe policy violations or is deleted, it halts propagation so `ChatBotCapability` never generates an AI response to harmful content.
  - **Isolated Unit Testing**: `PoliceModerationCapability` and `ChatBotCapability` are tested independently with lightweight mocks.
  - **Per-Guild Feature Toggles**: Any server can enable or disable capabilities independently via its `BotGuildConfig`.

---

## 3. Detailed Component Design

### 3.1 Capability Contract & Pipeline Interface

```typescript
/**
 * Shared capability interface implemented by all modular bot features.
 */
export interface IBotCapability {
  /** Unique capability identifier (e.g. 'police-moderation', 'chatbot-ai', 'voice-bouncer') */
  readonly id: string;
  readonly name: string;

  /** Initialize capability with active Discord client and global config */
  init(client: Client, config: Config): Promise<void> | void;

  /**
   * Evaluates an incoming message.
   * @returns true if the event was fully handled/intercepted (stops propagation), false or void to continue.
   */
  handleMessage?(
    message: Message,
    guildConfig?: BotGuildConfig,
  ): Promise<boolean | void>;

  /** Handles Discord slash commands and component interactions */
  handleInteraction?(
    interaction: Interaction,
    guildConfig?: BotGuildConfig,
  ): Promise<void>;

  /** Handles voice channel joins, moves, and leaves */
  handleVoiceStateUpdate?(
    oldState: VoiceState,
    newState: VoiceState,
    guildConfig?: BotGuildConfig,
  ): Promise<void>;

  /** Clean up timers, event listeners, or cache on shutdown */
  destroy?(): Promise<void> | void;
}
```

---

### 3.2 Unified Bot Engine (`DiscordBotEngine`)

```typescript
export class DiscordBotEngine {
  private client: Client;
  private capabilities: IBotCapability[] = [];
  private isOnline = false;
  private startTime: number = Date.now();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    // Register capability modules in priority order
    this.registerCapability(new PoliceModerationCapability());
    this.registerCapability(new ChatBotCapability());
  }

  public registerCapability(capability: IBotCapability): void {
    this.capabilities.push(capability);
  }

  public async start(token: string): Promise<void> {
    const config = Config.getInstance();
    
    // Initialize all capability modules
    for (const cap of this.capabilities) {
      await cap.init(this.client, config);
    }

    this.bindEventPipeline();
    await this.client.login(token);
    this.isOnline = true;
    this.startTime = Date.now();
  }

  private bindEventPipeline(): void {
    this.client.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.bot) return;

      const guildConfig = message.guildId
        ? Config.getInstance().getBotGuildConfig("chatBot", message.guildId)
        : undefined;

      // Sequential capability pipeline execution
      for (const cap of this.capabilities) {
        if (cap.handleMessage) {
          const intercepted = await cap.handleMessage(message, guildConfig);
          if (intercepted === true) {
            // Stop propagation down the pipeline
            break;
          }
        }
      }
    });

    this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      const guildConfig = interaction.guildId
        ? Config.getInstance().getBotGuildConfig("chatBot", interaction.guildId)
        : undefined;

      for (const cap of this.capabilities) {
        if (cap.handleInteraction) {
          await cap.handleInteraction(interaction, guildConfig);
        }
      }
    });
  }

  public getRuntimeMetrics() {
    return {
      status: this.isOnline ? "ONLINE" : "STOPPED",
      gatewayPingMs: this.client.ws.ping,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      joinedGuildsCount: this.client.guilds.cache.size,
      userTag: this.client.user?.tag,
      avatarUrl: this.client.user?.displayAvatarURL(),
    };
  }
}
```

---

### 3.3 Server Connection & Multi-Guild Management Model

1. **OAuth2 Bot Installation URL**:
   - The bot installation URL is constructed using `CHAT_BOT_CLIENT_ID`:
     ```
     https://discord.com/oauth2/authorize?client_id=${CHAT_BOT_CLIENT_ID}&permissions=8&scope=bot%20applications.commands
     ```
   - When administrators access the portal, the system lists:
     - **Joined Servers**: Guilds currently in `client.guilds.cache`.
     - **Installable Servers**: Guilds the logged-in admin owns/manages where the bot is not yet present.

2. **Per-Server Settings Structure (`BotGuildConfig`)**:
   - `replyChannelIds`: Whitelisted channel IDs for AI conversational replies.
   - `ignoredChannelIds`: Blacklisted channel IDs ignored by all bot capabilities.
   - `systemInstruction`: Custom AI persona prompt tailored for this Discord server.
   - `smartReply`: Ambient intent detection thresholds, debounce windows, and dismissal settings.
   - `tools`: Feature flags for Google Search, moderation tools, and voice matchmaking.

3. **Per-Server Command Deployment**:
   - Slash commands are deployed per server via `Routes.applicationGuildCommands(clientId, guildId)` with 1-click deployment from the portal.

---

## 4. REST API Endpoints (`/api/v1/*`)

| Method | Endpoint | Capability Guard | Description |
|---|---|---|---|
| `GET` | `/api/v1/bot` | `bot:read` | Returns bot runtime status, Gateway ping, uptime, joined server count |
| `POST` | `/api/v1/bot/restart` | `bot:lifecycle` | Reconnects Gateway WebSocket cleanly |
| `GET` | `/api/v1/bot/invite-url` | `bot:read` | Returns the Discord OAuth2 bot invite/installation link |
| `GET` | `/api/v1/guilds` | `guild:read` | Lists all joined servers and manageable uninstalled servers |
| `GET` | `/api/v1/guilds/:guildId` | `guild:read` | Returns channel tree (text, voice, threads) and guild details |
| `GET` | `/api/v1/guilds/:guildId/config` | `guild:read` | Fetches server-specific `BotGuildConfig` |
| `PUT` | `/api/v1/guilds/:guildId/config` | `guild:manage_channels` | Updates server-specific configuration and triggers live reload |
| `POST` | `/api/v1/guilds/:guildId/deploy-commands` | `guild:deploy_commands` | Deploys slash commands to target guild |
| `POST` | `/api/v1/guilds/deploy-commands-all` | `guild:deploy_commands` | Deploys slash commands to all joined guilds (Super Admin) |
| `GET` | `/api/v1/memory/guilds/:guildId/channels/:channelId` | `memory:read` | Retrieves conversation turns for a specific channel |
| `DELETE` | `/api/v1/memory/guilds/:guildId/channels/:channelId` | `memory:clear` | Clears conversation cache for a specific channel |
| `GET` | `/api/v1/dashboard/events` | `telemetry:read` | Real-time SSE stream of Gateway latency, memory, and activity logs |

---

## 5. Web Management Portal Architecture (`web/`)

1. **Dashboard & Telemetry Screen**:
   - Single Bot Overview card (Live status badge, Gateway Ping, Uptime, Joined Servers, Heap Memory).
   - OAuth2 Bot Installation Banner (instant copy / open invite link).
   - Live Gateway Activity Feed (real-time SSE stream).
2. **Server Explorer & Settings Manager**:
   - Guild grid / list showing connected vs. uninstalled servers.
   - Dedicated Server Settings panel for each connected server:
     - **Channels Management**: Checkbox selectors for `replyChannelIds` and `ignoredChannelIds`.
     - **AI Persona**: Textarea editor for custom server `systemInstruction`.
     - **Smart Reply**: Ambient intent toggle, confidence threshold slider.
     - **Tools**: Google Search and Moderation tool flags.
     - **1-Click Slash Command Deployment**.
3. **Memory Inspector**:
   - Channel turn browser and cache purge actions isolated per server.
4. **Global Config Editor**:
   - Inspect and edit global defaults with raw JSON diffing.
