# Discord Chat Bot App

## Setup

These 6 setup steps are required to run the bots.

### 1. Create Discord application

Follow Discord documentation to create a new application and get the client id and tokens for each bot: <https://discord.com/developers/docs/intro>.

You will need a separate bot token for each bot you intend to run (Chat Bot, Police Bot).

### 2. Create Google Cloud project

Follow Google Cloud documentation to create a new project: <https://cloud.google.com/docs/authentication/api-keys#create>.

Save the API Key to be used as the `AI_API_KEY` environment variable.

### 3. Download Google Service Account key

Follow Google Cloud documentation to create a new service account: <https://cloud.google.com/iam/docs/service-accounts-create>.

Download the service account key (JSON file) and save it as `service-account.json` at [./app](./) (see [./service-account.example.json](./service-account.example.json) for reference).

The service account is used by Firebase Admin SDK to authenticate with Firebase Remote Config and (optionally) Cloud Firestore for persistent memory.

### 4. Define environment variables

Copy [.env.example](./.env.example) to `.env.development` and fill in the values.

Key variables:

- `CLIENT_ID` — the Discord application (client) id, used to register slash commands.
- `CHATBOT_TOKEN` — bot token for the AI chat bot.
- `POLICE_BOT_TOKEN` — bot token for the moderation / police bot.
- `AI_API_KEY` — Google Cloud API key used by the `google-genai` provider.
- `BEARER_TOKEN` — a hard-to-guess shared secret that gates access to the private REST API routes (make up your own value).
- `SLEEP_REMINDER_SERVER_ID` — the guild id where the sleep-reminder feature is active (optional).

### 5. Configure bot routing

Bot routing is configured per bot and per Discord server through Firebase Remote Config.

Use [./src/config/bots.example.json](./src/config/bots.example.json) as the source for the `bots` Remote Config parameter. The shape is:

```json
{
  "chatBot": {
    "guilds": {
      "<guild-id>": {
        "replyChannelIds": ["<channel-id>"],
        "ignoredChannelIds": ["<channel-id>"],
        "respondToMentions": true
      }
    }
  },
  "policeBot": {
    "guilds": {
      "<guild-id>": {
        "replyChannelIds": [],
        "ignoredChannelIds": ["<channel-id>"],
        "respondToMentions": true
      }
    }
  }
}
```

Rules:

- `guilds` contains the guild-specific routing rules for a bot.
- If a guild is missing from a bot's `guilds` config, that bot ignores the guild entirely.
- `replyChannelIds` — channels where the bot replies without needing to be @mentioned.
- `ignoredChannelIds` — channels where the bot never processes messages.
- `respondToMentions` — whether the bot replies when directly @mentioned outside reply channels.

The `bots` parameter is one of many Remote Config parameters. Other notable parameters (all tunable at runtime without redeploying):

| Parameter | Type | Default | Description |
|---|---|---|---|
| `aiSystemInstruction` | string | `"You are a conversation chatbot."` | System prompt for the AI model |
| `aiProvider` | string | `"google-genai"` | AI provider: `google-genai` or `vertex` |
| `aiModelId` | string | `""` | Model ID override (e.g. `gemini-2.0-flash`) |
| `aiMaxOutputTokens` | number | `1024` | Max tokens per AI response |
| `aiMaxConversationHistory` | number | `60` | Sliding-window message limit for conversation memory |
| `memoryStoreType` | string | `"local"` | Persistence backend: `local` or `firestore` (see Step 6) |
| `guildMembers` | JSON | `{}` | Member metadata (nickname, username, gender) per guild |
| `guildEmojis` | JSON | `{}` | Custom emoji mappings per guild |

There is a code default for every parameter in [./src/config/defaultConfig.json](./src/config/defaultConfig.json), but the intended runtime source is Firebase Remote Config.

### 6. Configure persistence (conversation memory)

The bot supports two memory store backends for persisting conversation history across restarts.

#### Local file store (development default)

No extra setup needed. When `NODE_ENV=development` (the default for `pnpm dev`), the bot automatically writes conversation history to a local JSON file at `app/.data/conversations.json`. The `.data/` directory is created automatically if it does not exist.

To force local storage in any environment, set the `memoryStoreType` Remote Config parameter to `"local"` (or leave it at its default in `defaultConfig.json`).

#### Cloud Firestore store (production default)

When `NODE_ENV=production`, the bot uses Cloud Firestore. Make sure:

1. Firestore is enabled in your Google Cloud project.
2. The service account (`service-account.json`) has the **Cloud Datastore User** (or **Firebase Admin SDK Administrator**) IAM role.
3. Set the `memoryStoreType` Remote Config parameter to `"firestore"`.

Conversations are stored in the `conversations` Firestore collection with document IDs in the format `<botId>_<channelId>` (e.g. `1087094723984572416_123456789012345678`).

#### Overriding the store type via environment variable

You can override Remote Config by setting `MEMORY_STORE_TYPE` in your `.env` file:

```env
# Force local file store regardless of environment
MEMORY_STORE_TYPE=local

# Force Firestore store
MEMORY_STORE_TYPE=firestore
```

If `MEMORY_STORE_TYPE` is not set, the store type falls back to the `memoryStoreType` Remote Config parameter, which itself falls back to `defaultConfig.json` (`"local"` in development, `"firestore"` in production).

## Get Started

Make sure you have done the setup steps first.

### Install

This project uses [pnpm](https://pnpm.io/) as the package manager. If you don't have it installed, you can install it globally with:

```shell
npm install -g pnpm
```

Then, install the dependencies with

```shell
pnpm i
```

### Develop

```shell
pnpm dev
```

### Run

Run the app in production mode.

```shell
pnpm build
pnpm start
```

### Test

The project uses [Vitest](https://vitest.dev/) for unit, integration, and end-to-end testing, alongside [Supertest](https://github.com/ladjs/supertest) for HTTP API validation:

- **Unit Tests**: Co-located directly alongside source files in `src/` (e.g. `src/utils/emoji.test.ts`).
- **Integration Tests**: Placed under `tests/integration/`.
- **E2E Tests**: Placed under `tests/e2e/`.

```shell
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run E2E tests only
pnpm test:e2e

# Generate code coverage report
pnpm test:coverage
```

### Debug with VS Code

There are 2 debug configurations for VS Code

- `app: debug start`: Build, run then debug the app.
- `app: debug watch`: Build, run then debug the app with watcher enabled.

## Docker

```shell
pnpm docker-build

# Run in development mode container
pnpm docker-dev
# Run in production mode container
pnpm docker-prod
```
