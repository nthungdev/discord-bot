# Discord Chat Bot App

## Setup

These 4 setup steps are required to run the chat bot.

### 1. Create Discord application

Follow Discord documentation to create a new application and get the client id and token: <https://discord.com/developers/docs/intro>.

### 2. Create Google Cloud project

Follow Google Cloud documentation to create a new project: <https://cloud.google.com/docs/authentication/api-keys#create>.

Save the API Key to be used as the environment variable.

### 3. Download Google Service Account key

Follow Google Cloud documentation to create a new service account: <https://cloud.google.com/iam/docs/service-accounts-create>.

Download the service account key (JSON file) and save it as `service-account-key.json` at [./app](./).

### 4. Define environment variables

Create a `.env.development` file at [./app](./) with:

```env
CLIENT_ID=<Discord application id>
TOKEN=<the bot's token>
AI_API_KEY=<Google Cloud API key>
BEARER_TOKEN=<shared key to make requests to private RESTful APIs routes>
ALLOWED_SERVERS=<comma list of server ids that the chatbot will respond to when mentioned>
FREE_CHANNELS=<OMITTABLE comma list of channel ids that the chatbot will respond to without being mentioned>
```

It's up to you to make up the value for `BEARER_TOKEN`. It should be something hard to guess so that only authorized users can make requests to the private routes.

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
