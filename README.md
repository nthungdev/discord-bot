# Discord Bot Platform & System Management Portal

A modular, multi-feature Discord bot platform and web management portal written in TypeScript using [Discord.js](https://discord.js.org/), powered by Google GenAI / Vertex AI (Gemini), and managed via a sleek, real-time React 19 + Vite admin web application.

---

## 🌟 Key Features

### 🤖 Intelligent Discord Bots
- **Multimodal AI Chatbot**: Conversational assistant powered by Google Gemini with image understanding, file parsing, and sliding-window persistent memory.
- **Smart Reply & Ambient Intent Detection**: Tiered message targeting combining fast deterministic addressee filters with lightweight LLM classification for natural group conversations without repetitive `@bot` mentions.
- **Extensible Discord & Search Toolset**: Dynamic function calling with tools for Google Search, Discord channel management, scheduled server events, role queries, and voice status.
- **Police Moderation Bot**: Automated word filtering, policy enforcement, and message moderation across English and Vietnamese.
- **Discord Slash Commands**: Built-in slash commands such as `/checkin`, `/checkin-report`, `/ping`, `/server`, and `/user`.

### 🎛️ System Management & Web Admin Portal (`web/`)
- **Discord OAuth2 Single Sign-On (SSO)**: Secure operator login with capability-based Role-Based Access Control (`SUPER_ADMIN`, `GUILD_ADMIN`, `VIEWER`).
- **Dynamic Bot Orchestrator (`BotManager`)**: Runtime bot instance registration, token encryption vault (`AES-256-GCM`), and 1-click lifecycle controls (Start, Stop, Restart) without restarting the server.
- **Real-Time Telemetry & Event Streaming (SSE)**: Live Gateway WebSocket latency/ping tracking, heap memory metrics, message counters, and streaming activity feed.
- **Visual Remote Config Editor**: Inspect and live-reload Firebase Remote Config parameters, Smart Reply policies, AI model parameters, guild custom emojis, and guild rosters.
- **Guild Explorer & 1-Click Slash Command Deployer**: Inspect server topologies, voice/text channels, and deploy Discord application commands with a single click.
- **Conversation Memory Inspector**: Browse active conversation sessions, inspect dialogue turns with actor attribution, and clear memory caches.

---

## 🏗️ Monorepo Structure

```
discord-bot/
├── app/                           # Core Bot Engine, BotManager & Express REST API
│   ├── src/
│   │   ├── main.ts                # Dynamic Application Bootstrapper
│   │   ├── shared/                # Canonical Shared Types, DTOs, Schemas & Security Vault
│   │   ├── bots/                  # Bot implementations (BaseBot, ChatBot, PoliceBot)
│   │   ├── config/                # Remote Config & Local configuration schema
│   │   ├── server/                # Modular Express API (/api/v1/*) & SSE live telemetry
│   │   ├── services/              # BotManager, ConversationMemoryService, AddresseeService, Metrics
│   │   ├── tools/                 # Discord & Google Search tool registry
│   │   └── utils/                 # Emoji, token vault, GenAI utilities
│   └── package.json
├── web/                           # Vite + React 19 Admin Portal (Discord Dark Theme)
│   ├── src/
│   │   ├── components/            # UI components (BotCard, StatCard, ConfigEditor, GuildsExplorer)
│   │   ├── lib/api.ts             # REST API client & SSE event stream subscriber
│   │   └── App.tsx                # Dashboard, Bot Manager, Config, Memory, Guilds
│   ├── vite.config.ts
│   └── package.json
├── docs/                          # Architectural specifications and design docs
├── pnpm-workspace.yaml            # Monorepo workspace configuration
└── biome.json                     # Linter & formatter configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v22.0.0` or higher
- **pnpm**: `v10.0.0` or higher (`npm install -g pnpm`)
- **Google Cloud / Firebase Project**: With Gemini API enabled and a `service-account.json` credential.
- **Discord Application**: Client ID, Client Secret, and Bot Tokens from the [Discord Developer Portal](https://discord.com/developers/applications).

---

### Step 1: Install Dependencies

Install all dependencies across the workspace using `pnpm`:

```bash
pnpm install
```

---

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env.development` inside `app/`:

```bash
cp app/.env.example app/.env.development
```

2. Configure the key environment variables in `app/.env.development`:

```env
# Discord Bot Credentials
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_OAUTH_REDIRECT_URI=http://localhost:3001/api/v1/auth/discord/callback
CHATBOT_TOKEN=your_primary_chatbot_token
POLICE_BOT_TOKEN=your_police_bot_token

# Google GenAI / Gemini
AI_API_KEY=your_google_ai_studio_api_key

# Security & Sessions
BEARER_TOKEN=your_super_secret_bearer_token
SESSION_SECRET=your_session_jwt_secret_key
BOT_VAULT_ENCRYPTION_KEY=your_aes256_master_vault_key
ADMIN_DISCORD_USER_IDS=your_discord_user_id

# Server Port
PORT=3001
NODE_ENV=development
```

---

### Step 3: Service Account & Config Setup

1. Place your Google Cloud Service Account JSON file at `app/service-account.json`.
2. Copy `app/config.example.json` to `app/config.json`:

```bash
cp app/config.example.json app/config.json
```

---

### Step 4: Run Development Environment

You can run the backend bot engine and the Vite web management dashboard concurrently:

#### Start Backend Server & Bots:
```bash
# From repository root or app/
pnpm --prefix app dev
```
*The Express API server and Discord bots will boot up on `http://localhost:3001`.*

#### Start Web Admin Portal:
```bash
# In a separate terminal
pnpm --prefix web dev
```
*The Vite admin portal will start on `http://localhost:3000` with hot module reloading (HMR) and proxy API requests to port `3001`.*

---

## 🧪 Testing & Code Quality

The repository uses **Vitest** for unit, integration, and E2E testing, and **Biome** for fast linting and formatting.

```bash
# Run all test suites across the app
pnpm --prefix app test

# Run unit tests only
pnpm --prefix app test:unit

# Run integration tests (REST API & services)
pnpm --prefix app test:integration

# Run E2E simulation tests
pnpm --prefix app test:e2e

# Run TypeScript type checks across backend & frontend
pnpm typecheck

# Format and lint code with Biome
pnpm format
pnpm lint
```

---

## 🐳 Docker Deployment

The application includes Docker and Docker Compose configurations for containerized deployment:

```bash
# Build Docker image
pnpm --prefix app docker-build

# Run development container
pnpm --prefix app docker-dev

# Run production container (serves built web assets from web/dist)
pnpm --prefix app docker-prod
```

---

## 📖 Documentation & Architecture
- [System Management Web App Design (OMA-46)](docs/web-app-management-design.md)
- [Smart Reply & Addressee Intent Design (OMA-69)](docs/smart-reply-design.md)
- [Persistent Conversation Memory Design (OMA-40)](docs/persistent-memory-design.md)
- [Bouncergon Voice Bouncer & Matchmaking Design](docs/bouncergon-design.md)
- [AI Agent Guidelines](AGENTS.md)
