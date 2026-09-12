# Design Document: System Management Web Application (OMA-46)

**Issue**: [OMA-46: System Management Web Application](https://linear.app/hungnguyendev/issue/OMA-46/system-management-web-application)  
**Author**: Hung Nguyen  
**Status**: In Implementation  
**Target Platform**: `discord-bot` (Node.js 22, TypeScript 5, Discord.js v14, Google GenAI / Gemini, Express 4, Redux Toolkit, Biome, Vitest)  
**Date**: 2026-09-12  

---

## 1. Overview & System Goals

### 1.1 Current Architecture & Limitations
The `discord-bot` platform currently operates as a standalone headless Node.js service running in Docker or local Node environments:
- **Static Bot Initialization**: Bots (`ChatBot`, `PoliceBot`, and future `BouncergonBot`) are statically initialized at boot time in [main.ts](file:///Users/hung/Dev/discord-bot/app/src/main.ts) based on fixed environment variables (`CHATBOT_TOKEN`, `POLICE_BOT_TOKEN`). Adding, registering, or restarting an individual bot instance requires modifying source code or restarting the entire process.
- **Manual Configuration Management**: System configurations (e.g., `guildEmojis`, `guildMembers`, `bots` policies, `smartReply`, AI model selection, safety parameters, `tools` flags) must be manually edited in the Firebase Remote Config console or modified in `config.json`. There is no schema validation, visual editing, or dynamic reloading interface.
- **Opaque Observability & Monitoring**: Bot health, Discord Gateway WebSocket latency/ping, runtime memory consumption, conversation turn volume, AI generation latency, and moderation events are only observable via container logs or debugging outputs.
- **Manual Slash Command Deployment**: Refreshing and deploying Discord application slash commands to guilds requires manual HTTP calls via cURL or Postman to `/utility/deploy-command` with a static bearer token.
- **Lack of Role-Based Authentication**: The Express server relies on a single static `BEARER_TOKEN` header without support for operator logins, Discord Single Sign-On (SSO), or fine-grained administrative permissions.

### 1.2 Design Objectives
1. **Discord OAuth2 Single Sign-On (SSO)**: Allow operators to log in securely using their Discord accounts, authenticating identity and verifying administrative privileges via configurable admin user IDs, server roles, and permissions.
2. **Centralized Monitoring Dashboard**: Provide real-time operational visibility into bot instances (status, Gateway latency, uptime, memory usage, joined guilds, message activity, error logs, and AI inference latency).
3. **Dynamic Bot Registry & Lifecycle Orchestrator (`BotManager`)**: Enable registering new bot instances at runtime (`ChatBot`, `PoliceBot`, `BouncergonBot`), managing bot tokens securely, and dynamically starting, stopping, or restarting individual bots without process restarts.
4. **Interactive Guild Assignment & Slash Command Deployment**: Allow operators to inspect guilds where bots reside, manage per-guild channel configurations, and trigger 1-click slash command deployments directly from the UI.
5. **Visual Configuration Management**: Deliver a rich configuration editor for Firebase Remote Config / local fallback with schema validation, smart reply settings, tool feature flags, draft diffing, and live-reload triggering.
6. **Conversation & Memory Inspector**: Allow operators to browse active conversation sessions, inspect multi-user context turns, and clear memory cache per channel or bot instance.

---

## 2. Tech Stack Options & Architectural Trade-off Analysis

### 2.1 Shared Modules Location & Domain Boundaries: `/shared` vs. `/common`

| Option | Definition & Scope | Recommendation |
|---|---|---|
| **`/shared` (Domain Models, Contracts & DTOs)** | Holds canonical **domain contracts, API payload types, DTOs, Zod validation schemas, and domain security utilities** (e.g. `RegisteredBotRecord`, `BotConfig`, `UserSession`, `vault.ts`, `permissions.ts`) that are shared across the backend bot engine, API server, and web frontend. | **SELECTED for Domain Sharing** |
| **`/common` or `/utils` (Generic Helper Utilities)** | Holds **pure, domain-agnostic generic utilities** (e.g. string manipulation, date formatters, math calculations) that have no business logic coupling. | **Co-located in `/utils`** |

> **Decision**: Structure shared domain interfaces, DTOs, schemas, and security helpers under `app/src/shared/` (with clean TypeScript barrel exports). Generic utility helpers remain in `app/src/utils/`.

---

### 2.2 Server Structuring & Express Co-location vs. Separation

| Option | Pros | Cons | Decision |
|---|---|---|---|
| **Option A: Co-located Modular Express Server (`app/src/server/`)** | • Direct, in-memory access to `BotManager`, active Discord.js clients, and memory services without IPC/network hops.<br>• Single Node process to deploy, debug, and monitor in production.<br>• Zero serialization latency for real-time SSE telemetry streams.<br>• Clean architectural decoupling achieved through service interfaces and route controllers. | • Bot logic and HTTP server share the same Node process. | **SELECTED (Recommended)** |
| **Option B: Standalone Express Server Package (Separate Repo / Process)** | • Strict process boundary between bot worker and API server. | • Requires inter-process communication (IPC / Redis PubSub / gRPC) to inspect running Discord clients, fetch live Gateway pings, or trigger runtime restarts.<br>• Significantly increases operational overhead and Docker orchestration complexity for a single-team project. | Discarded |

> **Decision**: Co-locate the Express server within `app/src/server/`, structured cleanly with modular controllers, routes (`/api/v1/*`), and middlewares.

---

### 2.3 Frontend Framework, UI Components & Theming Architecture

#### 2.3.1 Framework & Build
- **Vite + React 19 SPA + TypeScript**: Ultra-fast HMR, sub-second builds, zero SSR complexity, statically compiled into `web/dist` and served directly by Express in production or via Vite dev proxy in development.

#### 2.3.2 Design System & Theming
- **Discord-Inspired Dark Aesthetic**:
  - Primary Backgrounds: Dark Obsidian (`#1e1f22`), Charcoal Sidebar (`#2b2d31`), Slate Container (`#313338`).
  - Accent Palette: Discord Blurple (`#5865F2`), Emerald Green (`#57F287`), Amber Warning (`#FEE75C`), Crimson Danger (`#ED4245`), Fuchsia Focus (`#EB459E`).
  - Glassmorphic panels with subtle frosted borders (`border-white/10`, `backdrop-blur-md`).
  - Dark / Light theme toggle support with system preference detection.

#### 2.3.3 Component Architecture
- **Radix UI Headless Primitives + Tailwind CSS**:
  - Accessible, unstyled primitives (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-switch`, `@radix-ui/react-tooltip`) styled with utility classes.
  - Reusable UI elements: `Button`, `Card`, `Badge`, `Modal`, `Table`, `Tabs`, `LiveStatusIndicator`, `MetricChart`, `JsonEditor`, `TerminalLogStream`.

---

## 3. Human-Friendly Permission & Access Management (RBAC & Capabilities)

Rather than exposing low-level bitflag math to operators or embedding raw hex arithmetic in business logic, permissions are managed through **human-readable capability keys**, **semantic permission guards**, and **configurable Discord role mappings**.

### 3.1 Named Capability Permissions

| Capability Key | Description |
|---|---|
| `bot:read` | View bot statuses, uptime, ping, and masked metadata |
| `bot:write` | Register, edit metadata, or unregister bot instances |
| `bot:lifecycle` | Start, stop, or restart bot instances |
| `bot:reveal_token` | View unmasked bot tokens and credentials |
| `guild:read` | View joined guilds and channel hierarchies |
| `guild:manage_channels` | Assign reply and ignored channels for a guild |
| `guild:deploy_commands` | Deploy slash commands to a guild |
| `config:read` | View active system and remote configuration |
| `config:write` | Modify and publish configuration changes |
| `config:reload` | Force live configuration reload across running bots |
| `memory:read` | Inspect conversation turn history |
| `memory:clear` | Clear conversation memory cache |
| `telemetry:read` | View process telemetry, CPU/memory stats, and SSE streams |

### 3.2 Role Capability Mappings

```typescript
export type PermissionCapability =
  | "bot:read" | "bot:write" | "bot:lifecycle" | "bot:reveal_token"
  | "guild:read" | "guild:manage_channels" | "guild:deploy_commands"
  | "config:read" | "config:write" | "config:reload"
  | "memory:read" | "memory:clear"
  | "telemetry:read";

export const ROLE_CAPABILITIES: Record<UserRole, readonly PermissionCapability[]> = {
  SUPER_ADMIN: [
    "bot:read", "bot:write", "bot:lifecycle", "bot:reveal_token",
    "guild:read", "guild:manage_channels", "guild:deploy_commands",
    "config:read", "config:write", "config:reload",
    "memory:read", "memory:clear",
    "telemetry:read",
  ],
  GUILD_ADMIN: [
    "bot:read",
    "guild:read", "guild:manage_channels", "guild:deploy_commands",
    "config:read",
    "memory:read", "memory:clear",
    "telemetry:read",
  ],
  VIEWER: [
    "bot:read",
    "config:read",
    "telemetry:read",
  ],
};
```

### 3.3 Semantic Access Resolution Strategies

1. **Super Admin Whitelist**: Configured via `ADMIN_DISCORD_USER_IDS` in `.env` / Remote Config, or automated requests with `Authorization: Bearer <TOKEN>`. Grants all capabilities (`*`).
2. **Configurable Guild Role Whitelist**: Administrators can specify role names or IDs in Remote Config (e.g. `adminRoleNames: ["Bot Admin", "Server Moderator"]`). When a user logs in, the bot verifies if they possess any of these roles in joined servers.
3. **Semantic Permission Helpers**: Encapsulate Discord permission evaluation inside clear helper functions (e.g. `isGuildAdministrator(guildPermissions)`, `canManageGuild(guildPermissions)`) using Discord.js `PermissionsBitField.Flags.ManageGuild` instead of manual bitwise logic.

---

## 4. System Architecture & Component Layout

```
discord-bot/
├── app/                           # Core Bot Engine & Express API Server
│   ├── src/
│   │   ├── main.ts                # Dynamic Application Bootstrapper
│   │   ├── shared/                # Canonical Shared Domain Models & Contracts
│   │   │   ├── types/             # Auth, Bot Registry, Config, Metrics, Memory interfaces
│   │   │   ├── schemas/           # Zod validation schemas
│   │   │   └── utils/             # AES-256-GCM vault, semantic permission evaluators
│   │   ├── bots/                  # Bot implementations (BaseBot, ChatBot, PoliceBot)
│   │   ├── config/                # Remote Config & Local configuration schema
│   │   ├── server/                # Modular Express API & SSE endpoints
│   │   │   ├── middlewares/       # Auth (OAuth2 JWT + Bearer), CORS, Capability Guards
│   │   │   ├── controllers/       # Route controllers (bots, config, memory, auth, dashboard)
│   │   │   └── routes/            # REST API routers (/api/v1/*)
│   │   ├── services/
│   │   │   ├── bot-manager/       # Dynamic Bot Orchestrator & Registry (IBotRegistryStore)
│   │   │   ├── memory/            # Persistent conversation memory (IMemoryStore)
│   │   │   ├── addressee/         # Smart Reply intent classification & heuristics
│   │   │   └── metrics/           # Real-time telemetry, latency & event logging
│   │   ├── tools/                 # Extensible Discord & search tool registry
│   │   └── utils/                 # Emoji, genAi helpers
│   └── package.json
├── web/                           # Vite + React 19 Admin Web Application
│   ├── src/
│   │   ├── components/            # UI components (BotCard, MetricChart, ConfigEditor, GuildPicker, Modal)
│   │   ├── pages/                 # Dashboard, Bots, Config, Memory, Guilds, Login
│   │   ├── hooks/                 # Real-time SSE hooks, TanStack Query fetchers
│   │   └── lib/                   # API client, Discord OAuth helpers, auth context
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── docs/                          # Architectural documentation & design docs
└── biome.json                     # Universal Biome configuration (linter & formatter)
```

---

## 5. Implementation Roadmap & Phasing

- **Phase 1: Shared Modules (`app/src/shared/`) & Token Vault**
  - Create canonical domain types (`auth.ts`, `bot-registry.ts`, `config-schema.ts`, `metrics.ts`, `memory.ts`).
  - Implement `vault.ts` for AES-256-GCM encryption, decryption, and token masking.
  - Implement `permissions.ts` with named capability checks and semantic role helpers.
- **Phase 2: Dynamic `BotManager` Engine & Telemetry Service**
  - Implement `LocalFileBotRegistryStore` and `FirestoreBotRegistryStore`.
  - Implement `BotManager` with lifecycle state machine, auto-start, and metrics aggregation.
  - Implement `MetricsService` with event bus and SSE broadcaster.
  - Refactor `main.ts` to boot bots through `BotManager`.
- **Phase 3: Authentication, RBAC & Modular Express REST API**
  - Implement Discord OAuth2 SSO flow (`/api/v1/auth/*`) and JWT session cookies.
  - Implement capability-based middleware guards (`requireCapability("bot:lifecycle")`).
  - Implement modular controllers and routers (`/api/v1/bots`, `/dashboard`, `/config`, `/memory`, `/guilds`).
- **Phase 4: Web Management Frontend (`web/`)**
  - Initialize Vite + React 19 + TypeScript + Tailwind CSS application with Discord dark theme.
  - Build Dashboard overview, Bot registry management, Config editor, Guild slash command manager, and Memory inspector.
  - Integrate Express static file serving for `web/dist` in production.
- **Phase 5: Verification & Automated Testing**
  - Unit tests with Vitest across shared modules, `BotManager`, token vault, auth, and config routes.
  - Integration tests with Supertest for `/api/v1/*` endpoints.
  - Biome formatting and linting verification (`pnpm lint`, `pnpm format`).
  - TypeScript type checking (`pnpm typecheck`).
