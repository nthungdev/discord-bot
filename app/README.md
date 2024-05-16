# Discord Chat Bot

## Setup

Create a `.env.development` file with

```env
TOKEN=<the bot's token>
SLEEP_REMINDER_SERVER_ID=<id of server to check for online voice channel users>
```

## Deploy

### Prepare GCP App Engine

1. Create a `.env.production` file with

    ```env
    TOKEN=<the bot's token>
    SLEEP_REMINDER_SERVER_ID=<id of server to check for online voice channel users>
    ```

2. Install `gcloud`

3. Initialize `gcloud`

### Deploy to GCP App Engine

Run `gcloud app deploy`

## TODOs

- [ ] document how to use service account.
- [ ] document setup.
- [ ] handle message with images.
- [x] allow bot to mention others.
