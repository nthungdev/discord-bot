# Directus Control Plane Architecture & Setup Guide

## 1. Overview & Architectural Role

[Directus](https://directus.io/) is the **Primary Control Plane and Headless CMS** for the Discord Bot ecosystem. It stores global system configuration (`bot_system_config`), per-guild feature policies (`bot_guild_configs`), AI roast presets (`bot_roast_presets`), user privacy & Riot profiles (`bot_user_profiles`), and operational audit telemetry (`bot_roast_logs`, `bot_match_logs`).

When `DIRECTUS_URL` and `DIRECTUS_BOT_TOKEN` are configured (and `USE_CONFIG_FILE` is not `true`), `Config` automatically boots with `CONFIG_SOURCE=directus`, using `app/config.json` as a local fallback snapshot. Firebase Admin SDK initialization is skipped unless `configSource=remote-config`, `memoryStoreType=firestore`, or `aiProvider=vertex`.

### Key Capabilities
- **Primary Runtime Configuration**: Centralized `bot_system_config` singleton and flattened per-guild `bot_guild_configs` rows mapped via `mapDirectusToAppConfig` with `app/config.json` fallback.
- **Web Admin Portal Write-Through**: Changes saved via the Web Admin Portal (`PATCH /api/v1/guilds/:guildId/config`) or `/val config` persist directly to Directus (`upsertBotGuildConfig` / `patchBotGuildConfig`) and update in-memory runtime config immediately.
- **AI Roast Persona Presets**: Centralized repository of system prompt guidelines, temperature overrides, and banned safety terms.
- **User Privacy & Riot Profiles**: Guild-scoped and global opt-out registries plus Riot account bindings (`riot_id`, `riot_region`, `riot_puuid`, `last_known_match_id`).
- **Audit Logs & Telemetry**: Asynchronous buffered logging of roast generations, response times, feedback scores, and match logs.
- **Zero-Downtime Cache Invalidation & Live Reload**: Directus Flow webhooks (`POST /api/v1/webhooks/cache-invalidate`) evict repository caches and trigger `Config.getInstance().loadConfig()` on `bot_system_config` and `bot_guild_configs` changes.

```mermaid
flowchart LR
    Operator["Bot Administrator"] -->|Edits Config & Presets| DirectusUI["Directus Web Admin (:8055)"]
    Portal["Web Admin Portal (:3000)"] -->|Write-Through PATCH| BotAPI["Express API (:3001)"]
    BotAPI -->|Upsert Guild Config| DirectusAPI["Directus Engine (PostgreSQL)"]
    DirectusUI --> DirectusAPI
    DirectusAPI -->|Flow Webhook: x-webhook-secret| WebhookReceiver["Express API: /api/v1/webhooks/cache-invalidate"]
    WebhookReceiver -->|Evict Cache & Config.loadConfig()| ConfigRuntime["Config Service & Repositories"]
    BotRuntime["Discord Bot Runtime"] -->|Read Config & Opt-Outs| ConfigRuntime
    ConfigRuntime -->|Fetch Snapshot & Fallback to config.json| DirectusAPI
    BotRuntime -->|Async Batch Telemetry Logs| DirectusAPI
```

---

## 2. Environment Variables Matrix

The system separates environment variables between the containerized Docker Compose stack and the Node.js Discord bot application.

### Docker Compose Stack (`compose.directus-dev.yaml`)
Defined in `.env.directus.example` (copied to `.env` at the repository root):

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `POSTGRES_USER` | `directus` | PostgreSQL database username |
| `POSTGRES_PASSWORD` | `directus_dev_password` | PostgreSQL database user password |
| `POSTGRES_DB` | `directus` | PostgreSQL database name |
| `POSTGRES_PORT` | `5433` | Host port mapped to PostgreSQL container (`5432`) |
| `DIRECTUS_PORT` | `8055` | Host port mapped to Directus Web Admin and REST API |
| `DIRECTUS_KEY` | `local-dev-directus-secret-key-32chars` | 32+ char secret key used for session/cookie generation |
| `DIRECTUS_SECRET` | `local-dev-directus-secret-token-32` | 32+ char secret token used for Directus encryption |
| `DIRECTUS_PUBLIC_URL` | `http://localhost:8055` | Publicly accessible URL of the Directus instance |
| `DIRECTUS_ADMIN_EMAIL` | `admin@local.dev` | Initial admin email created upon first container boot |
| `DIRECTUS_ADMIN_PASSWORD` | `adminpassword` | Initial admin password created upon first container boot |

### Discord Bot Engine (`app/.env.development`)
Configured in `app/.env.development` (template from `app/.env.example`):

| Variable | Required | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `CONFIG_SOURCE` | No | *(auto)* | Authoritative config source: `directus`, `remote-config`, or `local`. Auto-selects `directus` when `DIRECTUS_URL` and `DIRECTUS_BOT_TOKEN` are set (unless `USE_CONFIG_FILE=true`). |
| `USE_CONFIG_FILE` | No | `false` (`true` in `.env.example`) | When `true` or `1`, forces `CONFIG_SOURCE=local` (`app/config.json`) and bypasses Directus / Firebase Remote Config. |
| `DIRECTUS_URL` | No | `http://localhost:8055` | Base endpoint of Directus REST API |
| `DIRECTUS_BOT_TOKEN` | Yes* | *(none)* | Static service token assigned to the `bot-service` user |
| `MEMORY_STORE_TYPE` | No | `local` | Set to `directus` to activate Directus for opt-out persistence and telemetry |
| `INTERNAL_WEBHOOK_SECRET` | No | *(none)* | Shared secret for timing-safe authentication on cache invalidation webhook |
| `WEBHOOK_RECEIVER_URL` | No | `http://host.docker.internal:3001/api/v1/webhooks/cache-invalidate` | Callback URL registered in Directus (uses `host.docker.internal` so container reaches host bot) |
| `DIRECTUS_ADMIN_EMAIL` | No | `admin@local.dev` | Admin email used by `directus:setup` and `directus:migrate-config` (falls back to root `.env`) |
| `DIRECTUS_ADMIN_PASSWORD` | No | `adminpassword` | Admin password used by `directus:setup` and `directus:migrate-config` (falls back to root `.env`) |

*\* Required for `CONFIG_SOURCE=directus`, `MEMORY_STORE_TYPE=directus`, or `pnpm --prefix app directus:setup`.*

---

## 3. Collections Schema Reference

The database schema is declared programmatically in `app/src/scripts/setupDirectus.ts`. Running `pnpm --prefix app directus:setup` ensures collections, fields, RBAC policies, and Flows are provisioned without overwriting existing row data.

### `bot_system_config` (Singleton)
Stores global bot runtime and AI provider parameters (`10` configuration columns + `id`):

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` (PK) | *(auto)* | Hidden singleton primary key |
| `ai_provider` | `string` | `"google-genai"` | AI engine (`"antigravity"`, `"google-genai"`, `"vertex"`) |
| `ai_model_id` | `string` | `"gemini-3.6-flash"` | Default model identifier |
| `ai_api_endpoint` | `string` | `"us-central1-aiplatform.googleapis.com"` | Vertex AI regional endpoint |
| `ai_project_id` | `string` | *(null)* | Google Cloud Project ID (Vertex AI) |
| `ai_location_id` | `string` | `"us-central1"` | Google Cloud region (Vertex AI) |
| `ai_max_output_tokens` | `integer` | `8192` | Maximum generation tokens |
| `ai_max_conversation_history` | `integer` | `60` | Sliding-window conversation history limit |
| `ai_safety_settings` | `json` | *(null)* | Gemini safety settings JSON (`{ safetySettings: [...] }`) |
| `memory_store_type` | `string` | `"firestore"` | Default memory store (`"directus"`, `"local"`, `"firestore"`) |
| `check_in_leaderboard` | `string` | *(null)* | Check-in leaderboard configuration string |

### `bot_guild_configs`
Stores flattened per-guild bot settings organized across 9 Directus field groups (`id` UUID PK + 9 grouped sections):

#### 1. Core & Identity (`group_core_identity`)
- `bot_id` (`string`, Required, Default: `"chatBot"`): Bot instance identifier (`chatBot`, `policeBot`, or custom bot ID).
- `guild_id` (`string`, Unique, Required): Target Discord Guild Snowflake.
- `guild_name` (`string`): Human-readable guild name.
- `bot_name` (`string`): Display name / persona override for the guild.
- `lock_name` (`boolean`, Default: `false`): Keeps `bot_name` as primary name when guild nickname differs.
- `personalization` (`text`): Custom persona prompt text.
- `personalization_mode` (`string`, Default: `"overwrite_identity"`): `"overwrite_identity"`, `"extend"`, or `"overwrite_all"`.
- `system_instruction` (`text`): Guild-specific system instruction.
- `reply_delay` (`integer`, Default: `5000`): Reply delay in milliseconds.
- `locale_override` (`string`, Nullable): `"vi"` or `"en-US"`.
- `reply_channel_ids` (`json` `string[]`): Channels where the bot automatically participates.
- `ignored_channel_ids` (`json` `string[]`): Channels excluded from bot replies.
- `respond_to_mentions` (`boolean`, Default: `true`): Reply when directly mentioned.
- `chat_bot_model` (`json` `ModelConfig`): Per-guild chat model override.
- `tools_google_search` (`boolean`, Default: `true`): Enable Google Search tool.
- `tools_discord` (`boolean`, Default: `true`): Enable Discord management/query tools.

#### 2. Smart Reply (`group_smart_reply`)
- `smart_reply_enabled` (`boolean`, Default: `false`)
- `smart_reply_mode` (`string`, Default: `"mentions_and_vocative"`): `"disabled"`, `"mentions_and_vocative"`, or `"ambient_intent"`.
- `smart_reply_classifier_model` (`json` `ModelConfig`)
- `smart_reply_chat_bot_model` (`json` `ModelConfig`)
- `smart_reply_ambient_confidence_threshold` (`float`, Default: `0.75`)
- `smart_reply_debounce_ms` (`integer`, Default: `3500`)
- `smart_reply_max_debounce_ms` (`integer`, Default: `8000`)
- `smart_reply_session_ttl_seconds` (`integer`, Default: `45`)
- `smart_reply_strategy` (`string`, Default: `"hybrid"`): `"independent"`, `"coalesced"`, or `"hybrid"`.
- `smart_reply_coalesce_window_ms` (`integer`, Default: `1500`)
- `smart_reply_silence_duration_minutes` (`integer`, Default: `10`)
- `smart_reply_ambient_rate_limit_seconds` (`integer`, Default: `120`)
- `smart_reply_ambient_snapshot_limit` (`integer`, Default: `5`)
- `smart_reply_enable_keyword_dismissal` (`boolean`, Default: `true`)
- `smart_reply_enable_reaction_dismissal` (`boolean`, Default: `true`)
- `smart_reply_send_typing_behavior` (`string`, Default: `"deferred_for_ambient"`): `"immediate_for_all"`, `"deferred_for_ambient"`, or `"disabled"`.
- `smart_reply_thread_auto_listen` (`boolean`, Default: `true`)
- `smart_reply_opt_out_topic_tag` (`string`, Default: `"[no-bot]"`)

#### 3. Roast (`group_roast`)
- `roast_enabled` (`boolean`, Default: `true`)
- `roast_default_locale` (`string`, Default: `"vi"`): `"vi"` or `"en-US"`.
- `roast_locale_override` (`string`, Nullable): `"vi"` or `"en-US"`.
- `roast_max_intensity` (`string`, Default: `"savage"`): `"mild"`, `"medium"`, or `"savage"`.
- `roast_allowed_channel_ids` (`json` `string[]`)
- `roast_ignored_channel_ids` (`json` `string[]`)
- `roast_max_per_day` (`integer`, Default: `10`)
- `roast_target_shield_cooldown_seconds` (`integer`, Default: `300`)
- `roast_caller_cooldown_seconds` (`integer`, Default: `60`)
- `roast_allow_counter_roast` (`boolean`, Default: `true`)

#### 4. Moderation (`group_moderation`)
- `moderation_enabled` (`boolean`, Default: `false`)

#### 5. Voice Bouncer (`group_voice_bouncer`)
- `voice_bouncer_enabled` (`boolean`, Default: `false`)
- `voice_bouncer_tag_only_channel_ids` (`json` `string[]`)
- `voice_bouncer_tag_only_category_ids` (`json` `string[]`)
- `voice_bouncer_exempt_role_ids` (`json` `string[]`)
- `voice_bouncer_fallback_channel_id` (`string`)
- `voice_bouncer_action` (`string`, Default: `"disconnect"`): `"disconnect"` or `"move"`.
- `voice_bouncer_warning_message` (`text`)

#### 6. Matchmaking (`group_matchmaking`)
- `matchmaking_enabled` (`boolean`, Default: `false`)
- `matchmaking_lobby_channel_id` (`string`)
- `matchmaking_team1_channel_id` (`string`)
- `matchmaking_team2_channel_id` (`string`)
- `matchmaking_category_id` (`string`)
- `matchmaking_map_pool` (`json` `string[]`)
- `matchmaking_default_k_factor` (`integer`, Default: `32`)
- `matchmaking_initial_elo` (`integer`, Default: `1000`)
- `matchmaking_score_timeout_minutes` (`integer`, Default: `120`)
- `matchmaking_auto_move_players` (`boolean`, Default: `true`)

#### 7. Valorant (`group_valorant`)
- `valorant_enabled` (`boolean`, Default: `true`)
- `valorant_compare_enabled` (`boolean`, Default: `true`)
- `valorant_stats_enabled` (`boolean`, Default: `true`)
- `valorant_stats_default_period` (`string`, Default: `"recent_20"`): `"recent_20"`, `"current_act"`, or `"all_time"`.
- `valorant_auto_recap_enabled` (`boolean`, Default: `true`)
- `valorant_auto_recap_channel_id` (`string`)
- `valorant_auto_recap_min_tier_alert` (`integer`)
- `valorant_auto_recap_sportscaster_banter` (`boolean`, Default: `true`)
- `valorant_live_scouting_enabled` (`boolean`, Default: `true`)
- `valorant_live_scouting_channel_id` (`string`)
- `valorant_live_scouting_alert_on_game_start` (`boolean`, Default: `true`)
- `valorant_rank_role_sync_enabled` (`boolean`, Default: `false`)
- `valorant_rank_role_mappings` (`json` `Record<string, string>`)
- `valorant_tilt_enabled` (`boolean`, Default: `true`)
- `valorant_tilt_consecutive_losses_threshold` (`integer`, Default: `3`)
- `valorant_tilt_night_owl_hour_start` (`integer`, Default: `1`)
- `valorant_tilt_night_owl_hour_end` (`integer`, Default: `5`)
- `valorant_tilt_dm_alert` (`boolean`, Default: `true`)

#### 8. Voice Companion (`group_voice_companion`)
- `voice_companion_enabled` (`boolean`, Default: `false`)
- `voice_companion_auto_join_channel_id` (`string`)
- `voice_companion_inactivity_timeout_minutes` (`integer`, Default: `15`)
- `voice_companion_empty_channel_grace_seconds` (`integer`, Default: `60`)
- `voice_companion_model_id` (`string`, Default: `"gemini-3.8-live"`)
- `voice_companion_voice_name` (`string`, Default: `"Aoede"`): `"Puck"`, `"Charon"`, `"Kore"`, `"Fenrir"`, or `"Aoede"`.
- `voice_companion_system_instruction` (`text`)
- `voice_companion_energy_threshold` (`float`, Default: `0.012`)
- `voice_companion_barge_in_sensitivity` (`string`, Default: `"normal"`): `"high"`, `"normal"`, or `"low"`.
- `voice_companion_participation_mode` (`string`, Default: `"ambient"`): `"ambient"`, `"addressed_only"`, or `"push_to_talk"`.

#### 9. Guild Metadata (`group_guild_metadata`)
- `guild_emojis` (`json` `Record<string, string[]>`): Custom guild emoji symbol mappings.
- `guild_members` (`json` `GuildMembersConfigMember[]`): Guild member roster metadata (`username`, `name`, `gender`).

### `bot_roast_presets`
Stores AI prompt templates and generation parameters:
- `id` (`uuid`, PK)
- `preset_name` (`string`, Unique, Required): Identifier for prompt preset (e.g., `"default"`).
- `system_prompt` (`text`, Required): Custom instructions provided to Google Gemini.
- `temperature` (`float`, Default: `0.8`): Sampling temperature for roast generations.
- `is_active` (`boolean`, Default: `true`): Toggle preset availability.
- `banned_terms` (`json` `string[]`): Safety terms.

### `bot_user_profiles`
Maintains user preferences, privacy opt-outs, and Valorant Riot bindings:
- `id` (`uuid`, PK)
- `user_id` (`string`, Unique, Required): Discord User Snowflake.
- `opt_out_roast` (`boolean`, Default: `false`): Global opt-out flag from roasts.
- `opted_out_guild_ids` (`json` `string[]`): Guild-specific opt-out Snowflakes.
- `reputation_score` (`integer`, Default: `1000`): Community standing score.
- `riot_id`, `riot_region`, `riot_puuid`, `last_known_match_id` (`string`): Valorant player binding metadata.

### `bot_roast_logs`
Audit log and telemetry records (buffered in memory and drained periodically):
- `id` (`uuid`, PK)
- `guild_id`, `channel_id`, `caller_user_id`, `target_user_id`, `topic` (`string`)
- `generated_text` (`text`), `execution_time_ms` (`integer`), `feedback_rating` (`integer`, Optional)

### `bot_match_logs`
Historical match sessions schema:
- `id` (`uuid`, PK)
- `guild_id` (`string`), `team_a_roster` (`json`), `team_b_roster` (`json`)
- `score_team_a` (`integer`), `score_team_b` (`integer`), `winner` (`string`), `mvp_user_id` (`string`)

---

## 4. Cache Invalidation & Webhook Protocol

To minimize latency and avoid exhausting rate limits on Directus, `Config` and repositories cache reads in memory with TTL fallbacks. When changes occur in Directus:

1. A Directus Flow (`bot-cache-invalidation`, provisioned by `setupDirectus.ts`) watches `bot_system_config`, `bot_guild_configs`, and `bot_roast_presets` for `items.create`, `items.update`, and `items.delete` events.
2. Directus dispatches a `POST` request to `WEBHOOK_RECEIVER_URL` with the `x-webhook-secret` header.
   - For local development, `WEBHOOK_RECEIVER_URL` uses `host.docker.internal:3001` so the container routes to the bot running on the host machine. On Linux, `compose.directus-dev.yaml` maps `extra_hosts: ["host.docker.internal:host-gateway"]`.
3. The Express route handler (`/api/v1/webhooks/cache-invalidate`) validates `x-webhook-secret` using SHA-256 digest + `crypto.timingSafeEqual`.
4. Based on `collection`:
   - `bot_guild_configs`: Evicts affected guild entries in `guildConfigRepository.invalidate(...)` and triggers `Config.getInstance().loadConfig()` so the runtime `Config` snapshot updates immediately.
   - `bot_system_config`: Triggers `Config.getInstance().loadConfig()` to reload global system parameters immediately.
   - `bot_roast_presets`: Evicts cached preset entries in `roastPresetRepository.invalidate(...)`.

---

## 5. Local Setup & Config Migration Walkthrough

### Step 1: Prepare Environment Files
1. Copy the Docker Compose template:
   ```bash
   cp .env.directus.example .env
   ```
2. Configure Directus credentials in `app/.env.development`:
   ```bash
   DIRECTUS_URL=http://localhost:8055
   DIRECTUS_BOT_TOKEN=my-secure-directus-bot-token
   INTERNAL_WEBHOOK_SECRET=my-local-webhook-secret
   USE_CONFIG_FILE=false
   ```
   *Note: If you customize ports (`DIRECTUS_PORT`) or admin credentials in root `.env`, both `directus:setup` and `directus:migrate-config` automatically load them as fallbacks.*

### Step 2: Start Containers
```bash
docker compose -f compose.directus-dev.yaml up -d
```
Verify container health:
```bash
docker compose -f compose.directus-dev.yaml ps
```
Ensure `discord-bot-postgres-dev` displays `(healthy)`.

### Step 3: Bootstrap Schema, RBAC & Flows
Run the setup script from the workspace root:
```bash
pnpm --prefix app directus:setup
```
This script will:
- Authenticate with Directus using admin credentials (from `app/.env.development` or root `.env`).
- Provision `bot_system_config`, `bot_guild_configs` (all 9 field groups), `bot_roast_presets`, `bot_roast_logs`, `bot_match_logs`, and `bot_user_profiles`.
- Create the `bot-service-policy`, `bot-service` role, and `bot-service` user with `DIRECTUS_BOT_TOKEN`.
- Seed the default roast preset and provision the `bot-cache-invalidation` Flow pointing to `WEBHOOK_RECEIVER_URL`.

### Step 4: Migrate Existing `app/config.json` to Directus (Idempotent)
Seed `bot_system_config` and `bot_guild_configs` (including `guild_emojis` and `guild_members`) from your local `app/config.json`:

```bash
# Preview planned migrations without mutating Directus
pnpm --prefix app directus:migrate-config -- --dry-run

# Migrate missing guild rows and unconfigured system config (idempotent; skips existing rows)
pnpm --prefix app directus:migrate-config

# Migrate from a custom config file path (note: pnpm --prefix app runs with cwd=app/)
pnpm --prefix app directus:migrate-config -- --config ./config.production.json

# Force overwrite existing Directus system config and guild rows
pnpm --prefix app directus:migrate-config -- --force
```

**Idempotency behavior:**
- **Default (no `--force`)**: Skips `bot_system_config` if non-null configuration values already exist, and skips any `(bot_id, guild_id)` row already present in `bot_guild_configs`. Missing guild rows are created (`POST`), and an unconfigured `bot_system_config` singleton is populated (`PATCH`).
- **`--force` / `-f`**: Overwrites `bot_system_config` and patches existing `bot_guild_configs` rows with values from `config.json`.
- **`--dry-run`**: Prints planned creates, updates, and skips without executing `POST` or `PATCH` mutations.

### Step 5: Enable Directus in the Bot
In `app/.env.development`, ensure:
```bash
USE_CONFIG_FILE=false
DIRECTUS_URL=http://localhost:8055
DIRECTUS_BOT_TOKEN=my-secure-directus-bot-token
MEMORY_STORE_TYPE=directus
```
*(Setting `DIRECTUS_URL` and `DIRECTUS_BOT_TOKEN` with `USE_CONFIG_FILE=false` automatically selects `CONFIG_SOURCE=directus`. You can also set `CONFIG_SOURCE=directus` explicitly.)*

### Step 6: Verify via Admin UI
Open `http://localhost:8055` (or configured port):
- Sign in with `admin@local.dev` / `adminpassword`.
- Inspect `bot_system_config` and `bot_guild_configs` in the Content module.

---

## 6. Teardown & Troubleshooting

### Stopping Containers
```bash
docker compose -f compose.directus-dev.yaml down
```

### Full Reset (Wipe Database & Upload Volumes)
```bash
docker compose -f compose.directus-dev.yaml down -v
```

### Common Issues & Solutions

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Missing required environment variable: DIRECTUS_BOT_TOKEN` | `DIRECTUS_BOT_TOKEN` not configured in `app/.env.development` | Set `DIRECTUS_BOT_TOKEN` to a non-empty string in `app/.env.development`. |
| Port `5432` or `5433` already in use | Conflicting local PostgreSQL instance | Change `POSTGRES_PORT` in `.env` to another open port (e.g., `5434`). |
| Connection refused to Directus | Containers still initializing or non-default port used | Wait for container migrations to finish (`docker compose -f compose.directus-dev.yaml logs -f directus-dev`), or verify `DIRECTUS_PORT` in root `.env`. |
| Webhook requests fail from Directus | Using `localhost` instead of container host gateway | Ensure `WEBHOOK_RECEIVER_URL` uses `host.docker.internal:3001` so Directus can communicate across the Docker network to the host. |
| Cache invalidation webhook returns `401 Unauthorized` | Mismatched `INTERNAL_WEBHOOK_SECRET` | Verify `INTERNAL_WEBHOOK_SECRET` matches between `app/.env.development` and Directus Flow operation headers. |
