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
    ├── biome.json                 # Biome configuration (linter & formatter)
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
- **Linting & Formatting**: Biome (`@biomejs/biome`) via `app/biome.json`

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

# Run TypeScript type check without emitting files
pnpm --prefix app typecheck

# Clean build directory
pnpm --prefix app clean
```

### Linting & Formatting
```bash
# Run Biome check across the codebase (linting & formatting check)
pnpm --prefix app lint

# Format and automatically fix issues with Biome
pnpm --prefix app format
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

### TypeScript & Code Quality Standards

To ensure clean, human-readable, and maintainable code:

- **Limit Nesting & Callbacks**: Do not nest callbacks or closures more than 2 levels deep. Flatten logic using `async`/`await`, pipeline functions, or extracted handlers.
- **Prevent Complex Lambdas**: Avoid inline arrow functions with complex branching or multi-step calculations. Extract them into named, well-scoped helper functions with explicit parameter and return types.
- **Cognitive Complexity & Guard Clauses**: Keep function complexity low (target cyclomatic/cognitive complexity $\le 7$). Favor early returns and guard clauses over deep `if/else` ladders.
- **Destructuring with Defaults**: Prefer destructuring props, arguments, and options at function entry with explicit default values where applicable.
- **Explicit Return Types on Exports**: Always declare return types on exported utilities, domain services, bot handlers, and API route handlers to document intent and assist inference.
- **Immutability by Default**: Treat function arguments, incoming payloads, and state as read-only. Avoid in-place mutations of parameter objects or arrays.
- **Avoid Magic Values**: Do not use hardcoded magic numbers or magic strings in business logic, adapters, commands, or bot calculations (e.g. retry counts, timeouts, maximum prompt lengths, pagination defaults). Define well-named constants with descriptive identifiers in domain modules or dedicated constant files.
- **Pure Data Transformation Helpers**: Separate pure data mapping and algorithmic calculations from Discord client interactions and event lifecycles.
- **JSDoc Documentation**: Provide concise JSDoc comments explaining parameters, return values, and edge cases for exported utility functions, services, and API route handlers.

### Good vs. Bad Patterns

#### 1. Magic Numbers vs. Named Constants

❌ **Bad (Hardcoded magic numbers without context or maintainability):**

```typescript
// What does 5000 or 7 represent?
if (content.length > 5000) {
  throw new Error("Message too long");
}
for (let i = 0; i < 7; i++) {
  await runToolIteration();
}
```

✅ **Good (Descriptive named constants representing domain rules):**

```typescript
export const DISCORD_MAX_RAW_MESSAGE_LENGTH = 5000;
export const MAX_TOOL_ITERATIONS = 7;

if (content.length > DISCORD_MAX_RAW_MESSAGE_LENGTH) {
  throw new Error(
    `Message exceeds maximum allowed length of ${DISCORD_MAX_RAW_MESSAGE_LENGTH} characters.`,
  );
}
for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
  await runToolIteration();
}
```

#### 2. Nested Callbacks vs. Flattened Async / Named Helpers

❌ **Bad (Deep callback nesting & difficult error propagation):**

```typescript
function processUserMessage(msg: Message, callback: (result: any) => void) {
  fetchGuildConfig(msg.guildId, (config) => {
    evaluateModeration(msg.content, (isFlagged) => {
      if (isFlagged) {
        logViolation(msg.author.id, (logRes) => {
          callback(logRes);
        });
      }
    });
  });
}
```

✅ **Good (Async/await with clear flow and error boundaries):**

```typescript
/**
 * Evaluates a user message against guild moderation policy and records violations.
 */
async function processUserMessage(msg: Message): Promise<ModerationResult | null> {
  const config = await fetchGuildConfig(msg.guildId);
  const isFlagged = await evaluateModeration(msg.content, config);
  if (!isFlagged) {
    return null;
  }
  return await logViolation(msg.author.id);
}
```

#### 3. Complex Inline Lambdas vs. Named Pure Functions

❌ **Bad (Complex multi-line inline arrow function inside higher-order methods):**

```typescript
const eligibleChannels = channels.filter((ch) => {
  if (!ch.isTextBased() || ch.isThread()) return false;
  const hasPerms = ch.permissionsFor(botUser)?.has(PermissionFlagsBits.SendMessages);
  const isAllowed = !ignoredChannelIds.includes(ch.id);
  return hasPerms && isAllowed;
});
```

✅ **Good (Extracted, reusable, and unit-testable predicate):**

```typescript
/**
 * Determines whether a Discord channel is eligible for bot message dispatch.
 */
function isChannelEligibleForDispatch(
  channel: Channel,
  botUserId: string,
  ignoredChannelIds: readonly string[],
): boolean {
  if (!channel.isTextBased() || channel.isThread()) {
    return false;
  }
  const hasPermissions = channel.permissionsFor(botUserId)?.has(PermissionFlagsBits.SendMessages);
  const isAllowed = !ignoredChannelIds.includes(channel.id);
  return Boolean(hasPermissions && isAllowed);
}

const eligibleChannels = channels.filter((ch) =>
  isChannelEligibleForDispatch(ch, botUser.id, ignoredChannelIds),
);
```

#### 4. Deeply Nested Branching vs. Early Returns (Guard Clauses)

❌ **Bad (Accumulating indentations and hidden happy path):**

```typescript
function handleCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.guild) {
    if (isCommandEnabled(interaction.commandName)) {
      if (hasUserPermission(interaction.user)) {
        return executeCommand(interaction);
      } else {
        return interaction.reply({ content: "Unauthorized", ephemeral: true });
      }
    } else {
      return interaction.reply({ content: "Disabled command", ephemeral: true });
    }
  } else {
    return interaction.reply({ content: "Guild only", ephemeral: true });
  }
}
```

✅ **Good (Guard clauses with flat, readable structure):**

```typescript
/**
 * Validates prerequisites and dispatches a slash command interaction.
 */
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Guild only", ephemeral: true });
    return;
  }
  if (!isCommandEnabled(interaction.commandName)) {
    await interaction.reply({ content: "Disabled command", ephemeral: true });
    return;
  }
  if (!hasUserPermission(interaction.user)) {
    await interaction.reply({ content: "Unauthorized", ephemeral: true });
    return;
  }

  await executeCommand(interaction);
}
```

#### 5. Redundant / Obvious Comments

Avoid comments that merely restate what the code clearly says. Comments should explain non-obvious _why_, design decisions, or important domain context, not narrate obvious syntax.

❌ **Bad (Restating obvious function calls):**

```typescript
// Send reply to interaction
await interaction.reply({ content: "Done" });

// Increment counter
counter += 1;
```

✅ **Good (Self-documenting code without noise, or commenting non-obvious intent):**

```typescript
await interaction.reply({ content: "Done" });

// Deferring ephemeral acknowledgement because GenAI multimodal generation can exceed Discord's 3-second threshold
await interaction.deferReply({ ephemeral: true });
```

---

### Testing Conventions & Structure
- **Test File Organization**: All test files must be nested inside `__tests__` folders (e.g. `src/utils/__tests__/emoji.test.ts`, `src/bots/__tests__/chat-bot.test.ts`).
- **Unit Tests**: Co-located in nested `__tests__/` subdirectories within the corresponding module directory under `app/src/**/__tests__/`.
- **Integration Tests**: Located under `app/tests/integration/**/__tests__/` (e.g. `tests/integration/server/__tests__/auth.test.ts`).
- **E2E Tests**: Located under `app/tests/e2e/**/__tests__/` (e.g. `tests/e2e/__tests__/bot-interaction.test.ts`).
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
- When adding new API routes or updating existing API routes, always update the corresponding JSDoc comments.
- Handle errors gracefully using standard Express error handling middleware.

### Security & Credentials
- **NEVER** commit secret keys, bot tokens, or credentials to git.
- Secrets must be configured via environment variables (`.env.development` / production environment) or ignored credentials files (`service-account.json`).
- Ensure `.gitignore` continues to ignore `.env*`, `service-account.json`, `node_modules/`, and `build/`.

---

## 5. AI Agent Rules & Verification Checklist

When implementing changes in this codebase, AI agents must adhere to the following rules:

1. **Verify Before Completing**:
   - Always run `pnpm --prefix app format` and `pnpm --prefix app lint` and ensure there are no Biome errors or warnings.
   - Always run `pnpm --prefix app typecheck` (or `pnpm --prefix app build`) and verify that TypeScript compiles without errors.
   - Always run `pnpm --prefix app test` and ensure all tests pass.
2. **Preserve Documentation & Comments**:
   - Maintain existing docstrings and comments. Do not delete or alter comments unless directly refactoring that functionality.
3. **Git & Branching Conventions**:
   - Work on feature branches using the format `<username>/<issue-id>` (e.g. `hung/oma-76`).
   - Use [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`).
   - Pull request titles should be clear and descriptive, referencing the corresponding Linear ticket if applicable: `[OMA-XXX] <title>`.
   - When creating a pull request, keep the pull request description concise and high-level.
