# Discord Chat Bot

A Discord chat bot using [Discord.js](https://discord.js.org/) and [Google's Vertex AI (Gemini)](https://cloud.google.com/vertex-ai/).

## Setup

These 4 setup steps are required to run the app.

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

This project uses [yarn v1](https://classic.yarnpkg.com/lang/en/) so make sure you have it installed.

```shell
yarn install
```

### Develop

```shell
yarn dev
```

### Run

Run the app in production mode.

```shell
yarn build
yarn start
```

### Debug with VS Code

There are 2 debug configurations for VS Code

- `app: debug start`: Build, run then debug the app.
- `app: debug watch`: Build, run then debug the app with watcher enabled.

## Docker

```shell
yarn docker-build

# Run in development mode container
yarn docker-dev
# Run in production mode container
yarn docker-prod
```
