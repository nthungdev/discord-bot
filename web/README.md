# Discord Bot Admin Portal (`web`)

The frontend management web application for the `discord-bot` platform, built with **React 18 / 19**, **Vite 6**, **TypeScript**, and **Tailwind CSS**.

---

## 🎨 Features & Design System

- **Discord-Inspired Dark Aesthetic**: Custom palette styled after Discord's dark theme (`#1e1f22`, `#2b2d31`, `#313338`, Blurple `#5865F2`, Green `#57F287`, Yellow `#FEE75C`, Red `#ED4245`).
- **Real-Time Telemetry Streaming**: Consumes Server-Sent Events (SSE) from `/api/v1/dashboard/events` to stream live Gateway WebSocket latency, memory stats, and message activity feeds.
- **Dynamic Bot Lifecycle Control**: Register new bot instances with token encryption (`AES-256-GCM`), trigger Start/Stop/Restart actions, and monitor live status badges.
- **Visual Remote Config Editor**: Inspect active AI parameters, safety thresholds, and guild custom emojis with raw JSON mode and diffing.
- **Guild & Command Manager**: Browse server channel topologies (text and voice) and deploy Discord slash commands with a single click.
- **Conversation Memory Inspector**: Query stored multi-user turns by channel ID and clear memory cache with actor attribution.

---

## 🚀 Getting Started

### 1. Install Dependencies

From the workspace root or `web/` directory:

```bash
pnpm --filter discord-bot-web install
```

### 2. Development Server

Start Vite development server with Hot Module Replacement (HMR):

```bash
pnpm --filter discord-bot-web dev
```

*The web portal will run on `http://localhost:3000` and automatically proxy `/api` calls to the backend on `http://localhost:3001`.*

### 3. Production Build

Build static assets to `web/dist`:

```bash
pnpm --filter discord-bot-web build
```

*In production mode, the Express server in `app/` automatically serves the compiled `web/dist` SPA.*
