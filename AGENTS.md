# AI Agent Guidelines

Universal guidelines and rules for AI coding assistants working in the `discord-bot` repository.

---

## 1. Project Overview & Architecture

`discord-bot` is a modular, multi-feature Discord bot platform written in TypeScript using [Discord.js](https://discord.js.org/) and powered by Google GenAI / Vertex AI (Gemini).

### Key Features
- **AI Chat Bot**: Generative conversational bot with multimodal (text + image) capabilities and short-term conversational context.
- **Police Bot**: Moderation and message monitoring bot (e.g. word filtering, channel policy enforcement).
- **Discord Slash Commands**: Slash commands such as `checkin`, `checkin-report`, `ping`, `server`, and `user`.
- **REST API Server**: Express server providing administrative and utility endpoints secured with Bearer token authentication.
- **State Management**: Redux Toolkit store for managing runtime bot states and configurations.

### Directory Structure
```
discord-bot/
├── README.md                      # High-level repo overview
├── AGENTS.md                      # AI agent guidelines (this document)
├── CLAUDE.md                      # Claude-specific entrypoint
├── .github/
│   └── copilot-instructions.md    # GitHub Copilot instructions
├── .vscode/                       # VS Code debug configs and tasks
└── app/                           # Core application directory
    ├── package.json               # Dependencies and scripts (pnpm workspace)
    ├── eslint.config.mjs          # ESLint flat configuration (typescript-eslint)
    ├── nodemon.json               # Development nodemon configuration
    ├── global.d.ts                # Global type definitions (e.g. NodeJS.ProcessEnv)
    ├── Dockerfile                 # Container image specification
    ├── compose*.yaml              # Docker Compose definitions (base, dev, prod)
    └── src/
        ├── main.ts                # Application entrypoint
        ├── store.ts               # Redux Toolkit root store setup
        ├── types.ts               # Shared core interfaces and types
        ├── bots/                  # Bot implementations
        │   ├── base-bot.ts        # Abstract BaseBot class
        │   ├── chat-bot.ts        # AI-driven ChatBot implementation
        │   └── police-bot/        # Moderation and censoring bot
        ├── genAi/                 # GenAI integrations & provider abstractions
        │   ├── config.ts          # GenAI configuration
        │   ├── helpers.ts         # Formatting & prompt helpers
        │   ├── types.ts           # GenAI interfaces
        │   └── providers/         # Providers (@google/genai, vertexai)
        ├── discord/               # Discord client helpers and slash commands
        │   ├── deployCommands.ts  # Slash command deployment script
        │   ├── constants.ts       # Discord event & config constants
        │   ├── helpers.ts         # Discord utilities
        │   └── commands/          # Slash command definitions
        ├── features/              # Redux slices for bots and features
        ├── server/                # Express HTTP server
        │   ├── index.ts           # Express app setup & middleware
        │   ├── middlewares/       # Auth (Bearer token) and error handling
        │   └── routes/            # REST API endpoints
        ├── config/                # App configuration loader and schema
        └── utils/                 # General helpers (emoji, logger, etc.)
```

---

## 2. Tech Stack & Dependencies

- **Runtime**: Node.js 22+
- **Language**: TypeScript 5+ (ES modules)
- **Package Manager**: `pnpm` (Workspace configured via `pnpm-workspace.yaml`)
- **Libraries**:
  - `discord.js` (v14)
  - `@google/genai` & `@google-cloud/vertexai`
  - `@reduxjs/toolkit`
  - `express` & `body-parser`
  - `axios` & `axios-cache-interceptor`
  - `dotenv`
  - `firebase-admin`
- **Testing Tech Stack**:
  - `vitest` (v4+): Unified test runner for unit, integration, and E2E suites
  - `@vitest/coverage-v8`: Native code coverage
  - `supertest`: HTTP endpoint testing for Express API
- **Linting & Code Style**: ESLint v9 (`eslint.config.mjs`) with `typescript-eslint`

---

## 3. Development Workflow & Commands

All application commands must be executed within `app/` or with `--prefix app` using `pnpm`:

### Package Management
```bash
# Install dependencies
pnpm --prefix app install
```

### Development & Debugging
```bash
# Start development server with nodemon and ts-node
pnpm --prefix app dev

# Start development with inspect enabled (debugger on port 9229)
pnpm --prefix app debug
```

### Testing
```bash
# Run all tests
pnpm --prefix app test

# Run tests in interactive watch mode
pnpm --prefix app test:watch

# Run co-located unit tests only
pnpm --prefix app test:unit

# Run integration tests only
pnpm --prefix app test:integration

# Run E2E simulation tests only
pnpm --prefix app test:e2e

# Generate test coverage report
pnpm --prefix app test:coverage
```

### Build & Type Checking
```bash
# Compile TypeScript to build/
pnpm --prefix app build

# Clean build directory
pnpm --prefix app clean
```

### Linting
```bash
# Run ESLint across src
pnpm --prefix app lint
```

### Docker
```bash
# Build Docker image
pnpm --prefix app docker-build

# Run development container
pnpm --prefix app docker-dev

# Run production container
pnpm --prefix app docker-prod
```

---

## 4. Coding Standards & Architectural Guidelines

### TypeScript & Typing
- Maintain strict type safety. Avoid `any`; use typed generics, `unknown` with narrowing, or explicit interfaces.
- Add type declarations for new environment variables in `app/global.d.ts`.
- Export shared interfaces/types from their respective domain directories or `src/types.ts`.

### Testing Conventions & Structure
- **Unit Tests**: Co-located in the same directory as the source files being tested under `app/src/` (e.g., `src/utils/emoji.test.ts`, `src/features/chatbot.test.ts`).
- **Integration Tests**: Located under `app/tests/integration/` (e.g. testing Express routes and middleware with Supertest).
- **E2E Simulation Tests**: Located under `app/tests/e2e/` (e.g. simulated Discord event lifecycle and complete API flow).
- **Test Fixtures & Setup**: Shared mocks and global setup live in `app/tests/fixtures/` and `app/tests/setup.ts`.

### Bot Architecture
- All Discord bots must extend `BaseBot` (`app/src/bots/base-bot.ts`).
- Event listeners must be registered cleanly in the bot initialization lifecycle.
- State that needs to be accessed across modules or persisted during runtime should use Redux slices in `app/src/features/`.

### GenAI Provider Abstraction
- All AI model interactions must go through the provider interface under `app/src/genAi/providers/`.
- Do not instantiate Google GenAI / Vertex AI clients directly inside bot handlers or business logic; use `getGenAi()` from `app/src/genAi/index.ts`.

### Express & API Routes
- Administrative or privileged routes in `app/src/server/routes/` must be protected by the `auth` middleware (`app/src/server/middlewares/auth.ts`).
- Handle errors gracefully using standard Express error handling middleware.

### Security & Credentials
- **NEVER** commit secret keys, bot tokens, or credentials to git.
- Secrets must be configured via environment variables (`.env.development` / production environment) or ignored credentials files (`service-account.json`).
- Ensure `.gitignore` continues to ignore `.env*`, `service-account.json`, `node_modules/`, and `build/`.

---

## 5. AI Agent Rules & Verification Checklist

When implementing changes in this codebase, AI agents must adhere to the following rules:

1. **Verify Before Completing**:
   - Always run `pnpm --prefix app test` and ensure all tests pass.
   - Always run `pnpm --prefix app lint` and ensure there are no ESLint errors or warnings.
   - Always run `pnpm --prefix app build` (or `tsc --noEmit`) and verify that TypeScript compiles without errors.
2. **Preserve Documentation & Comments**:
   - Maintain existing docstrings and comments. Do not delete or alter comments unless directly refactoring that functionality.
3. **Git & Branching Conventions**:
   - Work on feature branches using the format `<username>/<issue-id>` (e.g. `hung/oma-44`).
   - Use [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`).
   - Pull request titles should be clear and descriptive, referencing the corresponding Linear ticket if applicable.
