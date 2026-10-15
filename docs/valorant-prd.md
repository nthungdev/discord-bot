# Product Requirements Document: Valorant Capability Suite

**Status**: Proposed / Specification  
**Target Platform**: `discord-bot` (Node.js 22, TypeScript 5, Discord.js v14, Directus 12 / Firestore)  
**Document Stage**: Stage 1 (PRD)  
**Authors**: Antigravity & Hung Nguyen  
**Date**: 2026-10-15  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context & Background
Within our community ("Bluegon Land"), **Valorant** is the most active multiplayer title. Members routinely play 5-stack competitive queues, organize 10-man custom scrims, and banter about aiming precision, clutches, and round throws.

However, community interactions suffer from several pain points:
1. **Alt-Tab Friction**: Settle head-to-head aiming debates or reviewing personal progress requires switching to third-party web trackers.
2. **Lack of Performance Continuity**: Players lose track of their net RR changes, headshot consistency over time, clutch success rates, and map weaknesses.
3. **Channel Notification Spam**: Automated match recaps can overwhelm general chat unless admins can precisely designate specific alert channels and toggle individual features.
4. **Fatigue & Tilt Spirals**: Players frequently play through late-night loss streaks without realizing how fatigue impacts their first-bullet accuracy and reaction time.

### 1.2 Objectives & Value Proposition
The **Valorant Capability Suite** provides a modular, granularly configurable esports hub inside Discord:
1. **Head-to-Head Compare (`/val compare`)**: Side-by-side aim precision, combat metrics, visual delta indicators, and a Google Gemini sportscaster verdict.
2. **Personal Stats Summarization (`/val stats`)**: Detailed career and recent form review with combat metrics, Net RR gains/losses, clutch records, and an AI Performance Coach.
3. **Configurable Automated Match Recaps**: Passive monitoring of linked member matches, generating dramatic or comedic sportscaster narratives in a designated channel.
4. **Live Match Scouting (`/val live`)**: Real-time lobby ranks, enemy smurf warnings, and map win rates.
5. **In-Game Rank Role Sync (`/riot link`)**: Mirroring live Valorant ranks (`@Immortal`, `@Ascendant`, `@Diamond`) to Discord vanity roles.
6. **Tilt Protection & Health Tracker (`/val health`)**: Proactive fatigue notifications after 3-match loss streaks.
7. **Granular Feature Toggles (`/val config`)**: Full per-guild administrative control to toggle every sub-feature independently.

---

## 2. User Personas & User Stories

### 2.1 Personas
* **The Competitive Fragger ("Hung")**: Duelist main; wants to review his Headshot %, ACS, net RR gains, and compare aim head-to-head against friends.
* **The Flex / Controller ("Dung")**: Plays smokes and utility; wants recognition for win rate, clutch rounds won, and economy discipline.
* **The Server Admin ("Admin")**: Wants to configure automated recap channels and disable features that don't fit the server culture.

### 2.2 User Stories
* **US-V1 (Head-to-Head Compare)**: As a player, I want to run `/val compare user1:@User1 user2:@User2` to compare Headshot %, K/D, ACS, ADR, clutch %, and signature agents with an AI verdict.
* **US-V2 (Personal Stats Summarization)**: As a player, I want to run `/val stats [period:recent_20|current_act|all_time]` to view my comprehensive aim KPIs, net RR change, clutch stats, map win rates, and Gemini AI coaching feedback.
* **US-V3 (Automated Post-Match Recap)**: As a guild member, I want the bot to automatically celebrate aces and roast hilarious 3/17 blunders in our dedicated gaming channel after matches.
* **US-V4 (Live Lobby Scouting)**: As a 5-stack, I want to run `/val live` while loading in to identify enemy ranks and smurf alerts before round 1.
* **US-V5 (Rank Role Sync)**: As an active player, I want my Discord server rank role (`@Valorant Ascendant`) updated automatically when I rank up.
* **US-V6 (Tilt Protection Alert)**: As a late-night gamer, I want a gentle alert when on a 3-loss streak suggesting a breather to preserve RR.
* **US-V7 (Granular Admin Configuration)**: As an admin, I want to run `/val config feature:<name> enabled:<true|false> [channel:#channel]` so I can selectively enable only the features our server wants.

---

## 3. Product Specifications & Commands

### 3.1 Command Suite (`/val`)

| Command | Arguments | Permission | Description |
| :--- | :--- | :---: | :--- |
| `/val stats` | `[user]`, `[period]`, `[mode]` | Everyone | Comprehensive career & recent form summary with AI coaching. |
| `/val compare` | `user1`, `user2`, `[act]` | Everyone | Side-by-side duel card with aim deltas and AI sportscaster verdict. |
| `/val live` | `[user]` | Everyone | Real-time live match scouting (ranks, smurfs, map win rates). |
| `/val profile` | `[user]` | Everyone | Compact player card with rank badge, top agents, and recent form. |
| `/val health` | `[user]` | Everyone | Aim fatigue analysis, late-night hours, and tilt risk factor. |
| `/val config` | `feature`, `enabled`, `[channel]` | Manage Guild | Granularly toggles sub-features or sets recap broadcast channels. |

### 3.2 Granular Feature Control Matrix

Every sub-feature can be independently enabled or disabled per guild:

| Sub-Feature Key | Default | Configurable Options | Description |
| :--- | :---: | :--- | :--- |
| `compare` | `true` | `enabled: boolean` | Enables `/val compare` duel cards. |
| `statsSummary` | `true` | `enabled: boolean`, `defaultPeriod` | Enables `/val stats` player performance cards and AI coach. |
| `autoRecap` | `true` | `enabled: boolean`, `channelId: string`, `minTierAlert` | Automated post-match sportscaster summaries in designated channel. |
| `liveScouting` | `true` | `enabled: boolean`, `channelId: string`, `alertOnGameStart` | Real-time lobby scouting and match start alerts. |
| `rankRoleSync` | `false` | `enabled: boolean`, `roleMappings: map` | Automatic server role synchronization for ladder ranks. |
| `tiltProtection` | `true` | `enabled: boolean`, `consecutiveLossesThreshold`, `dmAlert` | Nudges players after loss streaks. |

If a feature is disabled, running its command returns a polite ephemeral message:
> ⚠️ **[Valorant]** The `compare` feature is currently disabled on this server. Contact a server administrator to enable it.

---

## 4. Personal Stats Summarization Specification

### 4.1 Metrics & Telemetry
1. **Combat Precision**: K/D ratio, KDA, Headshot % (`hs / (hs + body + leg)`), ADR (Damage per Round), ACS (Combat Score), First Bloods per match.
2. **Rank & Rating Progression**: Current Rank, Peak Rank, Net RR delta across the selected window (e.g. `+58 RR` or `-34 RR`).
3. **Clutch Mastery**: Clutch win percentages broken down by scenario (1v1, 1v2, 1v3+).
4. **Hero & Map Synergy**: Most played agents with specific win rates and K/D; best map vs worst map win rate.
5. **AI Performance Coach (Google Gemini 2.5 Flash)**:
   - 🌟 **Strength**: 1 standout positive metric (e.g. "Outstanding 29% headshot rate on Vandal").
   - ⚠️ **Weakness**: 1 critical vulnerability (e.g. "24% opening death rate on defense rounds").
   - 💡 **Actionable Practice Drill**: 1 specific training or positioning tip.

---

## 5. Non-Goals & Boundaries
- ❌ Direct gameplay injection (no DLLs or client hooks).
- ❌ Native Riot RSO enterprise OAuth (uses Riot ID `name#tag` registration via `/riot link`).
- ❌ Video MP4 kill-feed rendering (unsupported by Riot API).
