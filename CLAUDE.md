# Claude Code Instructions

Guidelines and commands for working with the `discord-bot` repository.

Refer to [AGENTS.md](./AGENTS.md) for full architectural guidelines and conventions.

## Common Commands

```bash
# Install dependencies
pnpm --prefix app install

# Development mode (nodemon + ts-node)
pnpm --prefix app dev

# Type check & build
pnpm --prefix app build

# Linting
pnpm --prefix app lint

# Clean build output
pnpm --prefix app clean
```

## Key Guidelines

- **Workspace**: All bot application source code lives inside `app/src/`.
- **Package Manager**: Use `pnpm` exclusively.
- **Bot Hierarchy**: Extend `BaseBot` (`app/src/bots/base-bot.ts`) for all bot classes.
- **GenAI**: Use `getGenAi()` from `app/src/genAi/index.ts` rather than instantiating SDK clients directly.
- **State**: Use Redux Toolkit slices in `app/src/features/`.
- **Security**: Never commit `.env*` or credentials files.
- **Pre-commit Checklist**: Always run `pnpm --prefix app lint` and `pnpm --prefix app build` before finalizing changes.
