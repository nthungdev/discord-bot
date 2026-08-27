# Discord Chat Bot App

## Setup

These 5 setup steps are required to run the chat bot.

### 1. Create Discord application

Follow Discord documentation to create a new application and get the client id and token: <https://discord.com/developers/docs/intro>.

### 2. Create Google Cloud project

Follow Google Cloud documentation to create a new project: <https://cloud.google.com/docs/authentication/api-keys#create>.

Save the API Key to be used as the environment variable.

### 3. Download Google Service Account key

Follow Google Cloud documentation to create a new service account: <https://cloud.google.com/iam/docs/service-accounts-create>.

Download the service account key (JSON file) and save it as `service-account.json` at [./app](./) (see [./service-account.example.json](./service-account.example.json) for reference).

### 4. Define environment variables

Create a `.env.development` file at [./app](./) with:

```env
CLIENT_ID=<Discord application id>
CHATBOT_TOKEN=<the bot's token>
POLICE_BOT_TOKEN=<the police bot token>
AI_API_KEY=<Google Cloud API key>
BEARER_TOKEN=<shared key to make requests to private RESTful APIs routes>
```

It's up to you to make up the value for `BEARER_TOKEN`. It should be something hard to guess so that only authorized users can make requests to the private routes.

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
- If a guild is missing from a bot's `guilds` config, that bot ignores the guild.
- `replyChannelIds` are channels where the bot can reply without being mentioned.
- `ignoredChannelIds` are channels where the bot never processes messages.
- `respondToMentions` controls whether the bot replies when explicitly mentioned.

This structure leaves room for future bot-level settings alongside `guilds`, without reshaping the guild policy model again.

There is also a code default for this parameter in [./src/config/defaultConfig.json](./src/config/defaultConfig.json), but the intended runtime source is Firebase Remote Config.

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
