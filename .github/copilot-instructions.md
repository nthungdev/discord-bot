# GitHub Copilot Instructions

This repository is a TypeScript Discord Bot application powered by Discord.js, Google GenAI / Vertex AI (Gemini), Redux Toolkit, and Express.

For complete development guidelines, architecture overview, and agent rules, refer to [AGENTS.md](../AGENTS.md).

## Quick Reference

- **Package Manager**: Use `pnpm` exclusively (never `npm` or `yarn`).
- **Main Code Location**: `app/src`
- **Lint**: `pnpm --prefix app lint`
- **Build / Type Check**: `pnpm --prefix app build`
- **Dev**: `pnpm --prefix app dev`

## Core Rules
1. Maintain strict TypeScript types (no implicit `any`).
2. Implement AI features via the `src/genAi/providers` abstraction.
3. Bot implementations extend `BaseBot` (`src/bots/base-bot.ts`) and use Redux slices (`src/features/`) for state.
4. Protect administrative Express routes with `auth` middleware.
5. Never commit secret tokens or credentials (`.env*`, `service-account.json`).
6. Run `pnpm --prefix app lint` and `pnpm --prefix app build` before committing.
