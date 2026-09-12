# Discord Bot Engine & Management API Server (`app`)

The core bot execution engine and modular REST API server for `discord-bot`, powered by Node.js 22, TypeScript 5, Discord.js v14, Google GenAI / Gemini, and Express.

---

## 🚀 Setup & Getting Started

### 1. Discord Developer Application Setup
1. Create a Discord Application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Generate bot tokens for each bot you intend to run (`ChatBot`, `PoliceBot`, etc.).
3. Under **OAuth2 -> General**, add your redirect URI: `http://localhost:3001/api/v1/auth/discord/callback`.
4. Copy your **Client ID** and **Client Secret**.

---

### 2. Google Cloud & Firebase Setup
1. Create a Google Cloud project with the **Gemini API** / **Vertex AI API** enabled.
2. Obtain an API Key from Google AI Studio or Cloud Console for `AI_API_KEY`.
3. Create a Service Account with **Cloud Datastore User** / **Firebase Admin** permissions.
4. Download the Service Account JSON and save it as `app/service-account.json`.

---

### 3. Configure Environment Variables

Copy `.env.example` to `.env.development` and populate the values:

```bash
cp .env.example .env.development
```

| Variable | Description | Default |
|---|---|---|
| `DISCORD_TOKEN` | Discord Bot Token from Discord Developer Portal | Required |
| `DISCORD_CLIENT_ID` | Discord Application Client ID (Used for bot invite link, slash commands & OAuth2) | Required |
| `DISCORD_CLIENT_SECRET` | Discord Application Client Secret (Used for web portal OAuth2 login) | Required for Portal OAuth2 |
| `DISCORD_REDIRECT_URI` | Discord OAuth2 Callback URL | `http://localhost:3001/api/v1/auth/discord/callback` |
| `AI_API_KEY` | Google GenAI API key | Required for Gemini models |
| `BEARER_TOKEN` | Secret bearer token for administrative REST calls | Required |
| `SESSION_SECRET` | Secret key used to sign Discord OAuth2 session cookies | Random string |
| `ADMIN_DISCORD_USER_IDS` | Comma-separated Discord User IDs for Super Admins | `123456789,...` |
| `MEMORY_STORE_TYPE` | Persistence backend: `local` or `firestore` | `local` (dev) / `firestore` (prod) |
| `PORT` | Express server port | `3001` |



---

### 4. Configure `config.json`

Copy `config.example.json` to `config.json`:

```bash
cp config.example.json config.json
```

Key configuration parameters (managed locally or synchronized via Firebase Remote Config):
- `guilds`: Guild-specific routing rules, channel whitelists (`replyChannelIds`, `ignoredChannelIds`), and system prompts (`systemInstruction`).
- `smartReply`: Smart Reply & Ambient Intent classification configurations (`mode`, `replyStrategy`, `debounceMs`, `classifierModel`).
- `tools`: Feature flags for extensible tools (`googleSearch`, `discord`).
- `aiProvider`: `"google-genai"` or `"vertex"`.
- `aiModelId`: Gemini model identifier (e.g. `gemini-2.0-flash`, `gemini-1.5-pro`).
- `aiMaxOutputTokens`: Token ceiling per AI response (default: `8192`).
- `aiMaxConversationHistory`: Sliding-window message turn limit (default: `60`).
- `guildEmojis`: Mapping of emoji symbols to custom server emoji names.
- `guildMembers`: Guild roster metadata (real name, pronouns/gender).

---

## 📡 REST API & Telemetry Endpoints (`/api/v1/*`)

All protected endpoints require either a Discord OAuth2 session cookie (`session_token`) or `Authorization: Bearer <TOKEN>` header.

### Authentication (`/api/v1/auth`)
- `GET /api/v1/auth/discord/login` — Initiates Discord OAuth2 login redirect.
- `GET /api/v1/auth/discord/callback` — Handles OAuth2 callback, verifies admin permissions, sets signed session cookie.
- `GET /api/v1/auth/me` — Returns current authenticated user session, role, and authorized guilds.
- `POST /api/v1/auth/logout` — Clears session cookie and invalidates session.

### Bot Lifecycle & Registry (`/api/v1/bots`)
- `GET /api/v1/bots` — List all registered bot instances and runtime telemetry metrics.
- `POST /api/v1/bots` — Register a new bot instance with AES-256-GCM token encryption.
- `GET /api/v1/bots/:id` — Get detailed metadata and status for a bot.
- `PATCH /api/v1/bots/:id` — Update bot metadata or configuration overrides.
- `DELETE /api/v1/bots/:id` — Unregister and stop a bot instance.
- `POST /api/v1/bots/:id/start` — Start a registered bot instance.
- `POST /api/v1/bots/:id/stop` — Stop a running bot instance.
- `POST /api/v1/bots/:id/restart` — Restart an active bot instance.
- `GET /api/v1/bots/:id/guilds` — List all joined Discord servers and channel hierarchies.
- `POST /api/v1/bots/:id/guilds/:guildId/deploy-commands` — Deploy slash commands to a single guild.
- `POST /api/v1/bots/:id/deploy-commands-all` — Bulk deploy slash commands to all joined guilds.

### Dashboard & Telemetry (`/api/v1/dashboard`)
- `GET /api/v1/dashboard/stats` — High-level system statistics and process memory telemetry.
- `GET /api/v1/dashboard/events` — Server-Sent Events (SSE) live telemetry tick and activity stream.

### Configuration (`/api/v1/config`)
- `GET /api/v1/config` — Retrieve active system configuration.
- `POST /api/v1/config/reload` — Force running bots to reload configuration from Remote Config / template.

### Conversation Memory (`/api/v1/memory`)
- `GET /api/v1/memory/conversations/:botId/:channelId` — Retrieve stored conversation turns for a channel.
- `DELETE /api/v1/memory/conversations/:botId/:channelId` — Clear conversation history for a channel.
- `DELETE /api/v1/memory/conversations` — Purge all conversation history across all bots (Super Admin).

---

## 🛠️ Development Commands

```bash
# Start development server with nodemon & ts-node
pnpm dev

# Start development with debugger on port 9229
pnpm debug

# Build TypeScript to build/
pnpm build

# Start compiled production server
pnpm start

# Run all test suites
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run TypeScript type check
pnpm typecheck

# Format and lint code with Biome
pnpm format
pnpm lint
```
