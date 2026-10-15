# Product Requirements Document: Teamfight Tactics (TFT) Capability Suite

**Status**: Proposed / Specification  
**Target Platform**: `discord-bot` (Node.js 22, TypeScript 5, Discord.js v14, Directus 12 / Firestore)  
**Document Stage**: Stage 1 (PRD)  
**Authors**: Antigravity & Hung Nguyen  
**Date**: 2026-10-15  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context & Background
**Teamfight Tactics (TFT)** is a high-tempo, strategic auto-battler played extensively by community members in "Bluegon Land". Unlike fast-twitch tactical shooters, TFT is governed by economics, augment probability, item combinations, and pivot timing.

Currently, community members experience friction when trying to share their TFT journey:
1. **Alt-Tabbing During Critical Rounds**: Calculating roll-down probabilities at Level 8 or figuring out the best craft for 3 random components on the bench requires navigating complex third-party tools (MetaTFT, Tactics.tools) mid-round under tight time pressure.
2. **Lack of Performance Visualization**: Players want to see their full placement distribution (1st through 8th histogram), average placement, and top-performing trait lines.
3. **Uncelebrated High-Rolls & Fast-8th Banter**: Hitting 3-star 4-costs or taking a disastrous 8th-place exit at Stage 4-2 are peak moments of humor and pride that should be automatically captured and shared with friends.
4. **Administrative Customization**: Server administrators require granular control over which TFT utilities and announcement features are active to match community preferences.

### 1.2 Objectives & Value Proposition
The **TFT Capability Suite** equips the bot with an intelligent tactical coach, companion, and stats engine:
1. **Personal Stats Summarization (`/tft stats`)**: Placement distribution histogram (1st-8th), Top 4 rate, win rate, LP delta, favorite traits, and an AI Tactician review.
2. **Head-to-Head Compare (`/tft compare`)**: Side-by-side tactical profile comparing placement averages, top 4 rates, tempo profiles, and Gemini playstyle verdicts.
3. **Bench Itemizer Solver (`/tft items`)**: Enter raw uncombined components and receive ranked meta craftable items instantly in chat.
4. **Meta Comp Advisor (`/tft comp`)**: Up-to-date board positioning, carry/tank BiS itemization, leveling curves, and augment tier recommendations.
5. **Roll Probability Calculator (`/tft roll`)**: Hypergeometric math calculating exact odds of hitting 2-star 4-costs or 5-costs with available gold.
6. **Configurable Automated Match Recaps**: Automatically celebrates 1st-place victories and playfully roasts 8th-place fast-exits in designated gaming channels.
7. **Granular Feature Toggles (`/tft config`)**: Per-guild control to toggle every sub-feature independently.

---

## 2. User Personas & User Stories

### 2.1 Personas
* **The Fast-8 Tempo Climber ("Minh")**: Plays for consistent Top 4 finishes; wants to track average placement, review augment choices, and celebrate climbing to Master.
* **The High-Rolling Gambler ("Dung")**: Plays mercenary / fortune comps; plays for 1st or 8th; loves to banter about hitting 3-star 5-costs or taking early exits.
* **The Server Admin ("Admin")**: Wants to configure where 1st-place victory celebrations post and disable roll calculators if desired.

### 2.2 User Stories
* **US-T1 (Personal Stats Summarization)**: As a TFT player, I want to run `/tft stats [period:current_set|recent_20]` to view my placement distribution (1st-8th), average placement, Top 4 rate, LP progression, and AI Tactician review.
* **US-T2 (Head-to-Head Compare)**: As a player, I want to run `/tft compare user1:@User1 user2:@User2` to compare average placement, win rates, and tactical archetypes.
* **US-T3 (Bench Itemizer Solver)**: As a player with uncombined components, I want to run `/tft items components:sword, rod, tear` to receive instant meta craft recommendations.
* **US-T4 (Meta Comp Lookup)**: As a player, I want to run `/tft comp [name]` to view optimal board layout, core items, and leveling strategy.
* **US-T5 (Roll Probability Calculator)**: As a player planning a roll-down, I want to run `/tft roll level:8 cost:4` to see my exact mathematical odds of hitting carry units.
* **US-T6 (Automated High-Roll & 8th Recaps)**: As a member, I want the bot to automatically post celebratory cards when someone takes 1st place, and comedic roasts when someone takes 8th place.
* **US-T7 (Granular Admin Configuration)**: As an admin, I want to run `/tft config feature:<name> enabled:<true|false> [channel:#channel]` to customize active features.

---

## 3. Product Specifications & Commands

### 3.1 Command Suite (`/tft`)

| Command | Arguments | Permission | Description |
| :--- | :--- | :---: | :--- |
| `/tft stats` | `[user]`, `[period]` | Everyone | Placement distribution, average place, top traits, and AI Tactician review. |
| `/tft compare` | `user1`, `user2` | Everyone | Side-by-side tactical profile comparison with Gemini playstyle verdict. |
| `/tft items` | `components` (String, Req) | Everyone | Solves bench item components into ranked meta items. |
| `/tft comp` | `name` (String, Autocomplete) | Everyone | Displays board positioning, BiS items, leveling curve, and augments. |
| `/tft roll` | `level` (Int), `cost` (Int) | Everyone | Computes shop odds and hyper-roll probabilities for remaining gold. |
| `/tft live` | `[user]` | Everyone | Inspects active lobby tier average and contested compositions. |
| `/tft config` | `feature`, `enabled`, `[channel]` | Manage Guild | Granularly toggles sub-features or sets celebration broadcast channels. |

### 3.2 Granular Feature Control Matrix

Every sub-feature can be independently enabled or disabled per guild:

| Sub-Feature Key | Default | Configurable Options | Description |
| :--- | :---: | :--- | :--- |
| `statsSummary` | `true` | `enabled: boolean`, `defaultPeriod` | Enables `/tft stats` personal performance cards and AI tactician. |
| `compare` | `true` | `enabled: boolean` | Enables `/tft compare` tactical duel cards. |
| `itemizer` | `true` | `enabled: boolean` | Enables `/tft items` bench component solver. |
| `compAdvisor` | `true` | `enabled: boolean` | Enables `/tft comp` board layout sheets. |
| `rollOdds` | `true` | `enabled: boolean` | Enables `/tft roll` probability calculator. |
| `autoRecap` | `true` | `enabled: boolean`, `channelId: string`, `minPlacementForCelebration` | Automated 1st place celebrations & 8th place banters. |
| `rankRoleSync` | `false` | `enabled: boolean`, `roleMappings: map` | Automatic server role synchronization for TFT tiers (`@TFT Master`). |

If a feature is disabled, running its command returns a polite ephemeral message:
> ⚠️ **[TFT]** The `compAdvisor` feature is currently disabled on this server. Contact a server administrator to enable it.

---

## 4. Personal Stats Summarization Specification

### 4.1 Metrics & Telemetry
1. **Placement Distribution Histogram**:
   - Visual breakdown: `🥇 1st: [4] | 🥈 2nd: [3] | 🥉 3rd: [2] | 4th: [3] | 5th: [2] | 6th: [1] | 7th: [1] | 💀 8th: [4]`
2. **Placement KPIs**: Average Placement (e.g. `3.65`), Top 4 Rate % (e.g. `60.0%`), Win Rate % (1st place rate, e.g. `20.0%`).
3. **Rank & Rating Progression**: Current Tier, Division, LP, and net LP change across recent games.
4. **Top Compositions & Traits**: Top 3 most played trait lines with their specific average placement.
5. **AI Tactician Verdict (Google Gemini 2.5 Flash)**:
   - 🌟 **Strength**: Analysis of economy and tempo discipline.
   - ⚠️ **Weakness**: Identified vulnerability (e.g. holding uncombined items too long, failing contested pivots).
   - 💡 **Actionable Tip**: Meta recommendation for the current set.

---

## 5. Non-Goals & Boundaries
- ❌ Automated gameplay botting or live auto-rolling overlays.
- ❌ League of Legends Summoner's Rift 5v5 MOBA tracking (TFT only).
