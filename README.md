# Discord Chat Bot

A Discord chat bot using [Discord.js](https://discord.js.org/) and [Google's Vertex AI (Gemini)](https://cloud.google.com/vertex-ai/).

Navigate to the [app](./app) directory to get started.

There are plans to add more directories to the root for other features; therefore, currently, the source code is in the `app` directory.

## Features

- Respond to messages and replies.
- View and comprehend images.
- Respond to commands.
  - `checkin`: Check in to an activity.
  - `checkin-report`: Generate a check-in report.
- Short-term history: keep track of the recent messages as context.
- Customization
  - Define instructions to how the bot would respond to messages.
  - Define members' information (nickname, username, gender) so the bot can refer to and mention in messages.

## Testing

Testing is powered by [Vitest](https://vitest.dev/) with co-located unit tests (`app/src/**/*.test.ts`), integration suites (`app/tests/integration/`), and E2E simulation suites (`app/tests/e2e/`). Run `pnpm --prefix app test` to execute all tests.
