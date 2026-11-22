import { describe, expect, it } from "vitest";
import type { AppConfigData } from "../../../config";
import type { BotGuildConfig } from "../../../config/types";
import {
  isSafeRecordKey,
  mapAppConfigToDirectusSystemPayload,
  mapBotGuildConfigToDirectusPayload,
  mapDirectusRowToBotGuildConfig,
  mapDirectusToAppConfig,
  mapPartialBotGuildConfigToDirectusPayload,
} from "../config-mapper";
import type { DirectusGuildConfigRaw, DirectusSystemConfigRaw } from "../types";

const BASE_FALLBACK_CONFIG: AppConfigData = {
  guildEmojis: {
    "fallback-guild": { "👍": ["thumbsup"] },
  },
  guildMembers: {
    "fallback-guild": [{ username: "alice", name: "Alice", gender: "female" }],
  },
  bots: {
    chatBot: {
      guilds: {
        "fallback-guild": {
          replyChannelIds: ["ch-fb"],
          ignoredChannelIds: [],
          respondToMentions: true,
        },
      },
    },
    policeBot: { guilds: {} },
  },
  checkInLeaderboard: "fallback-lb",
  aiSafetySettings: {
    safetySettings: [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    ],
  },
  aiProjectId: "fallback-project",
  aiModelId: "gemini-3.6-flash",
  aiMaxOutputTokens: 4096,
  aiLocationId: "us-central1",
  aiProvider: "google-genai",
  aiApiEndpoint: "us-central1-aiplatform.googleapis.com",
  aiMaxConversationHistory: 30,
  memoryStoreType: "local",
};

describe("Directus Config Mapper", () => {
  it("should round-trip a full BotGuildConfig across all flattened Directus columns", () => {
    const fullGuildConfig: BotGuildConfig = {
      botName: "Mimi",
      lockName: true,
      personalization: "Playful assistant",
      personalizationMode: "extend",
      systemInstruction: "Be concise.",
      replyDelay: 500,
      localeOverride: "en-US",
      replyChannelIds: ["ch-1", "ch-2"],
      ignoredChannelIds: ["ch-ign"],
      respondToMentions: true,
      chatBotModel: {
        provider: "google-genai",
        modelId: "gemini-3.8-flash",
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.9,
      },
      tools: {
        googleSearch: true,
        discord: false,
      },
      smartReply: {
        enabled: true,
        mode: "ambient_intent",
        classifierModel: { modelId: "gemini-3.5-flash-lite", temperature: 0.0 },
        chatBotModel: { modelId: "gemini-3.8-flash", temperature: 0.8 },
        ambientConfidenceThreshold: 0.78,
        debounceMs: 1200,
        maxDebounceMs: 4000,
        sessionTtlSeconds: 600,
        replyStrategy: "hybrid",
        coalesceWindowMs: 2500,
        silenceDurationMinutes: 15,
        ambientRateLimitSeconds: 20,
        ambientSnapshotLimit: 12,
        enableKeywordDismissal: true,
        enableReactionDismissal: false,
        sendTypingBehavior: "deferred_for_ambient",
        threadAutoListen: true,
        optOutTopicTag: "serious",
      },
      roast: {
        enabled: true,
        defaultLocale: "vi",
        localeOverride: "en-US",
        maxIntensity: "savage",
        allowedChannelIds: ["roast-1"],
        ignoredChannelIds: ["roast-ign"],
        maxPerDay: 25,
        targetShieldCooldownSeconds: 300,
        callerCooldownSeconds: 60,
        allowCounterRoast: true,
      },
      moderation: {
        enabled: true,
      },
      voiceBouncer: {
        enabled: true,
        tagOnlyVoiceChannelIds: ["vc-1"],
        tagOnlyCategoryIds: ["cat-1"],
        exemptRoleIds: ["role-vip"],
        fallbackChannelId: "vc-lobby",
        action: "move",
        warningMessage: "Need guild tag",
      },
      matchmaking: {
        enabled: true,
        lobbyVoiceChannelId: "vc-mm-lobby",
        team1VoiceChannelId: "vc-t1",
        team2VoiceChannelId: "vc-t2",
        matchCategoryId: "cat-mm",
        mapPool: ["Ascent", "Bind"],
        defaultKFactor: 32,
        initialElo: 1000,
        scoreReportingTimeoutMinutes: 45,
        autoMovePlayers: true,
      },
      valorant: {
        enabled: true,
        features: {
          compare: { enabled: true },
          statsSummary: { enabled: false, defaultPeriod: "current_act" },
          autoRecap: {
            enabled: true,
            channelId: "ch-recap",
            minTierAlert: 15,
            sportscasterBanter: true,
          },
          liveScouting: {
            enabled: true,
            channelId: "ch-scout",
            alertOnGameStart: false,
          },
          rankRoleSync: {
            enabled: true,
            roleMappings: { Radiant: "role-rad" },
          },
          tiltProtection: {
            enabled: true,
            consecutiveLossesThreshold: 3,
            nightOwlHourStart: 1,
            nightOwlHourEnd: 5,
            dmAlert: false,
          },
        },
      },
      voiceCompanion: {
        enabled: true,
        autoJoinChannelId: "vc-comp",
        inactivityTimeoutMinutes: 10,
        emptyChannelGraceSeconds: 30,
        modelId: "gemini-3.8-live",
        voiceName: "Aoede",
        systemInstruction: "Speak softly.",
        energyThreshold: 0.02,
        bargeInSensitivity: "high",
        participationMode: "addressed_only",
      },
    };

    const payload = mapBotGuildConfigToDirectusPayload(
      "chatBot",
      "guild-full",
      fullGuildConfig,
    );

    expect(payload.bot_id).toBe("chatBot");
    expect(payload.guild_id).toBe("guild-full");
    expect(payload.roast_max_per_day).toBe(25);
    expect(payload.smart_reply_enabled).toBe(true);
    expect(payload.smart_reply_mode).toBe("ambient_intent");
    expect(payload.smart_reply_classifier_model).toEqual({
      modelId: "gemini-3.5-flash-lite",
      temperature: 0.0,
    });
    expect(payload.smart_reply_chat_bot_model).toEqual({
      modelId: "gemini-3.8-flash",
      temperature: 0.8,
    });
    expect(payload.smart_reply_ambient_confidence_threshold).toBe(0.78);
    expect(payload.smart_reply_debounce_ms).toBe(1200);
    expect(payload.smart_reply_max_debounce_ms).toBe(4000);
    expect(payload.smart_reply_session_ttl_seconds).toBe(600);
    expect(payload.smart_reply_strategy).toBe("hybrid");
    expect(payload.smart_reply_coalesce_window_ms).toBe(2500);
    expect(payload.smart_reply_silence_duration_minutes).toBe(15);
    expect(payload.smart_reply_ambient_rate_limit_seconds).toBe(20);
    expect(payload.smart_reply_ambient_snapshot_limit).toBe(12);
    expect(payload.smart_reply_enable_keyword_dismissal).toBe(true);
    expect(payload.smart_reply_enable_reaction_dismissal).toBe(false);
    expect(payload.smart_reply_send_typing_behavior).toBe(
      "deferred_for_ambient",
    );
    expect(payload.smart_reply_thread_auto_listen).toBe(true);
    expect(payload.smart_reply_opt_out_topic_tag).toBe("serious");
    expect(payload.matchmaking_score_timeout_minutes).toBe(45);

    const roundTripped = mapDirectusRowToBotGuildConfig({
      id: "row-1",
      ...payload,
    } as DirectusGuildConfigRaw);

    expect(roundTripped).toEqual(fullGuildConfig);
  });

  it("should preserve zero and false falsy values during BotGuildConfig round-trip", () => {
    const zeroedConfig: BotGuildConfig = {
      lockName: false,
      replyDelay: 0,
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      tools: { googleSearch: false, discord: false },
      smartReply: {
        enabled: false,
        ambientConfidenceThreshold: 0,
        debounceMs: 0,
        maxDebounceMs: 0,
        sessionTtlSeconds: 0,
        coalesceWindowMs: 0,
        silenceDurationMinutes: 0,
        ambientRateLimitSeconds: 0,
        ambientSnapshotLimit: 0,
        enableKeywordDismissal: false,
        enableReactionDismissal: false,
        threadAutoListen: false,
      },
      roast: {
        enabled: false,
        maxPerDay: 0,
        targetShieldCooldownSeconds: 0,
        callerCooldownSeconds: 0,
        allowCounterRoast: false,
      },
      moderation: { enabled: false },
      voiceBouncer: { enabled: false },
      matchmaking: {
        enabled: false,
        defaultKFactor: 0,
        initialElo: 0,
        scoreReportingTimeoutMinutes: 0,
        autoMovePlayers: false,
      },
      valorant: {
        enabled: false,
        features: {
          compare: { enabled: false },
          statsSummary: { enabled: false },
          autoRecap: {
            enabled: false,
            minTierAlert: 0,
            sportscasterBanter: false,
          },
          liveScouting: { enabled: false, alertOnGameStart: false },
          rankRoleSync: { enabled: false },
          tiltProtection: {
            enabled: false,
            consecutiveLossesThreshold: 0,
            nightOwlHourStart: 0,
            nightOwlHourEnd: 0,
            dmAlert: false,
          },
        },
      },
      voiceCompanion: {
        enabled: false,
        inactivityTimeoutMinutes: 0,
        emptyChannelGraceSeconds: 0,
        energyThreshold: 0,
      },
    };

    const payload = mapBotGuildConfigToDirectusPayload(
      "",
      "guild-zero",
      zeroedConfig,
    );
    expect(payload.bot_id).toBe("chatBot");

    const roundTripped = mapDirectusRowToBotGuildConfig({
      id: "row-zero",
      ...payload,
    } as DirectusGuildConfigRaw);

    expect(roundTripped).toEqual(zeroedConfig);
  });

  it('should normalize "en" to "en-US" across locale fields and ignore invalid locales', () => {
    const config = mapDirectusRowToBotGuildConfig({
      id: "row-en",
      guild_id: "g-en",
      locale_override: "en" as unknown as "en-US",
      roast_default_locale: "en",
      roast_locale_override: "en" as unknown as "en-US",
    });

    expect(config.localeOverride).toBe("en-US");
    expect(config.roast?.defaultLocale).toBe("en-US");
    expect(config.roast?.localeOverride).toBe("en-US");

    const invalidLocaleConfig = mapDirectusRowToBotGuildConfig({
      id: "row-bad-locale",
      guild_id: "g-bad-locale",
      locale_override: "fr" as unknown as "en-US",
      roast_default_locale: "jp" as unknown as "en",
      roast_locale_override: "de" as unknown as "en-US",
    });

    expect(invalidLocaleConfig.localeOverride).toBeUndefined();
    expect(invalidLocaleConfig.roast).toBeUndefined();
  });

  it("should map system config and guild rows into AppConfigData without mutating fallbackLocalConfig", () => {
    const fallbackSnapshot = structuredClone(BASE_FALLBACK_CONFIG);

    const systemRow: DirectusSystemConfigRaw = {
      id: "sys-1",
      ai_provider: "vertex",
      ai_model_id: "gemini-3.8-flash",
      ai_api_endpoint: "asia-southeast1-aiplatform.googleapis.com",
      ai_project_id: "directus-proj",
      ai_location_id: "asia-southeast1",
      ai_max_output_tokens: 16384,
      ai_max_conversation_history: 100,
      ai_safety_settings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
      memory_store_type: "directus",
      check_in_leaderboard: "directus-lb",
    };

    const guildRows: DirectusGuildConfigRaw[] = [
      {
        id: "g-row-1",
        bot_id: null,
        guild_id: "guild-1",
        reply_channel_ids: ["ch-1"],
        ignored_channel_ids: ["ch-2"],
        respond_to_mentions: true,
        guild_emojis: { "🔥": ["fire_custom"] },
        guild_members: [{ username: "bob", name: "Bob", gender: "male" }],
      },
      {
        id: "g-row-2",
        bot_id: "policeBot",
        guild_id: "guild-2",
        moderation_enabled: true,
      },
    ];

    const mapped = mapDirectusToAppConfig(
      systemRow,
      guildRows,
      BASE_FALLBACK_CONFIG,
    );

    expect(mapped.aiProvider).toBe("vertex");
    expect(mapped.aiModelId).toBe("gemini-3.8-flash");
    expect(mapped.aiProjectId).toBe("directus-proj");
    expect(mapped.aiLocationId).toBe("asia-southeast1");
    expect(mapped.aiApiEndpoint).toBe(
      "asia-southeast1-aiplatform.googleapis.com",
    );
    expect(mapped.aiMaxOutputTokens).toBe(16384);
    expect(mapped.aiMaxConversationHistory).toBe(100);
    expect(mapped.memoryStoreType).toBe("directus");
    expect(mapped.checkInLeaderboard).toBe("directus-lb");
    expect(mapped.aiSafetySettings).toEqual({
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    });
    expect(mapped.bots.chatBot.guilds["guild-1"]).toBeDefined();
    expect(mapped.bots.chatBot.guilds["guild-1"].respondToMentions).toBe(true);
    expect(mapped.bots.policeBot.guilds["guild-2"]?.moderation?.enabled).toBe(
      true,
    );
    expect(mapped.guildEmojis["guild-1"]).toEqual({ "🔥": ["fire_custom"] });
    expect(mapped.guildMembers["guild-1"]).toEqual([
      { username: "bob", name: "Bob", gender: "male" },
    ]);

    // Verify fallback was never mutated
    expect(BASE_FALLBACK_CONFIG).toEqual(fallbackSnapshot);
  });

  it("should accept object-wrapped ai_safety_settings and handle malformed fields defensively", () => {
    const systemRow: DirectusSystemConfigRaw = {
      id: "sys-obj",
      ai_safety_settings: {
        safetySettings: [
          { category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_NONE" },
        ],
      },
    };

    const malformedRow: DirectusGuildConfigRaw = {
      id: "g-bad",
      guild_id: "guild-bad",
      reply_channel_ids: "not-an-array" as unknown as string[],
      ignored_channel_ids: { a: "b" } as unknown as string[],
      roast_allowed_channel_ids: "12345" as unknown as string[],
      matchmaking_map_pool: 42 as unknown as string[],
      chat_bot_model: "invalid" as unknown as BotGuildConfig["chatBotModel"],
      guild_emojis: "bad" as unknown as Record<string, string[]>,
      guild_members:
        "bad" as unknown as DirectusGuildConfigRaw["guild_members"],
    };

    const mapped = mapDirectusToAppConfig(
      systemRow,
      [malformedRow],
      BASE_FALLBACK_CONFIG,
    );

    expect(mapped.aiSafetySettings).toEqual({
      safetySettings: [
        { category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_NONE" },
      ],
    });
    const badGuild = mapped.bots.chatBot.guilds["guild-bad"];
    expect(badGuild.replyChannelIds).toEqual([]);
    expect(badGuild.ignoredChannelIds).toEqual([]);
    expect(badGuild.roast?.allowedChannelIds).toBeUndefined();
    expect(badGuild.matchmaking?.mapPool).toBeUndefined();
    expect(badGuild.chatBotModel).toBeUndefined();
    expect(mapped.guildEmojis["guild-bad"]).toBeUndefined();
    expect(mapped.guildMembers["guild-bad"]).toBeUndefined();
  });

  it("should map partial AppConfigData to DirectusSystemConfigRaw payload", () => {
    const payload = mapAppConfigToDirectusSystemPayload({
      aiProvider: "antigravity",
      aiModelId: "claude-sonnet-5-5-high",
      memoryStoreType: "directus",
      aiSafetySettings: {
        safetySettings: [{ category: "CAT", threshold: "BLOCK_NONE" }],
      },
    });

    expect(payload).toEqual({
      ai_provider: "antigravity",
      ai_model_id: "claude-sonnet-5-5-high",
      memory_store_type: "directus",
      ai_safety_settings: {
        safetySettings: [{ category: "CAT", threshold: "BLOCK_NONE" }],
      },
    });
  });

  it("should handle empty and complete system config payloads including zero numeric values", () => {
    expect(mapAppConfigToDirectusSystemPayload({})).toEqual({});

    const payload = mapAppConfigToDirectusSystemPayload({
      aiProvider: "vertex",
      aiModelId: "gemini-3.8-flash",
      aiApiEndpoint: "us-central1-aiplatform.googleapis.com",
      aiProjectId: "proj-1",
      aiLocationId: "us-central1",
      aiMaxOutputTokens: 0,
      aiMaxConversationHistory: 0,
      checkInLeaderboard: "lb-1",
      memoryStoreType: "firestore",
      aiSafetySettings: {
        safetySettings: [{ category: "HARM_CAT", threshold: "BLOCK_LOW" }],
      },
    });

    expect(payload).toEqual({
      ai_provider: "vertex",
      ai_model_id: "gemini-3.8-flash",
      ai_api_endpoint: "us-central1-aiplatform.googleapis.com",
      ai_project_id: "proj-1",
      ai_location_id: "us-central1",
      ai_max_output_tokens: 0,
      ai_max_conversation_history: 0,
      check_in_leaderboard: "lb-1",
      memory_store_type: "firestore",
      ai_safety_settings: {
        safetySettings: [{ category: "HARM_CAT", threshold: "BLOCK_LOW" }],
      },
    });
  });

  it("should support multiple bots (chatBot, policeBot, custom botId), default omitted bot_id to chatBot, and skip rows without guild_id", () => {
    const fallbackWithCustomBot: AppConfigData = {
      ...structuredClone(BASE_FALLBACK_CONFIG),
      bots: {
        ...structuredClone(BASE_FALLBACK_CONFIG.bots),
        legacyCustomBot: {
          guilds: {
            "legacy-g": {
              replyChannelIds: ["ch-legacy"],
              ignoredChannelIds: [],
              respondToMentions: false,
            },
          },
        },
      },
    };

    const rows: DirectusGuildConfigRaw[] = [
      {
        id: "row-omitted-bot",
        guild_id: "shared-guild",
        respond_to_mentions: true,
        reply_channel_ids: ["ch-chat"],
      },
      {
        id: "row-police",
        bot_id: "policeBot",
        guild_id: "shared-guild",
        moderation_enabled: true,
      },
      {
        id: "row-custom",
        bot_id: "triageBot",
        guild_id: "shared-guild",
        reply_channel_ids: ["ch-triage"],
        respond_to_mentions: false,
      },
      {
        id: "row-no-guild",
        bot_id: "chatBot",
        guild_id: "",
        respond_to_mentions: true,
      },
    ];

    const mapped = mapDirectusToAppConfig(null, rows, fallbackWithCustomBot);

    expect(mapped.bots.chatBot.guilds["shared-guild"]?.replyChannelIds).toEqual(
      ["ch-chat"],
    );
    expect(
      mapped.bots.policeBot.guilds["shared-guild"]?.moderation?.enabled,
    ).toBe(true);
    expect(
      mapped.bots.triageBot?.guilds["shared-guild"]?.replyChannelIds,
    ).toEqual(["ch-triage"]);
    expect(mapped.bots.chatBot.guilds[""]).toBeUndefined();
    expect(
      mapped.bots.legacyCustomBot?.guilds["legacy-g"]?.replyChannelIds,
    ).toEqual(["ch-legacy"]);
    expect(mapped.bots.chatBot.guilds["fallback-guild"]).toBeDefined();
  });

  it("should fall back to fallbackLocalConfig when systemRow is null/invalid and preserve fallback guild metadata when omitted", () => {
    const invalidSystemRow: DirectusSystemConfigRaw = {
      id: "sys-bad",
      memory_store_type: "redis" as unknown as "directus",
      ai_safety_settings:
        "not-valid" as unknown as DirectusSystemConfigRaw["ai_safety_settings"],
    };

    const rowWithoutMetadata: DirectusGuildConfigRaw = {
      id: "row-no-meta",
      bot_id: "chatBot",
      guild_id: "fallback-guild",
      respond_to_mentions: false,
      guild_emojis: null,
      guild_members: null,
    };

    const mappedFromInvalid = mapDirectusToAppConfig(
      invalidSystemRow,
      [rowWithoutMetadata],
      BASE_FALLBACK_CONFIG,
    );

    expect(mappedFromInvalid.memoryStoreType).toBe("local");
    expect(mappedFromInvalid.aiSafetySettings).toEqual(
      BASE_FALLBACK_CONFIG.aiSafetySettings,
    );
    expect(mappedFromInvalid.guildEmojis["fallback-guild"]).toEqual({
      "👍": ["thumbsup"],
    });
    expect(mappedFromInvalid.guildMembers["fallback-guild"]).toEqual([
      { username: "alice", name: "Alice", gender: "female" },
    ]);

    const mappedFromNullSystem = mapDirectusToAppConfig(
      null,
      [],
      BASE_FALLBACK_CONFIG,
    );
    expect(mappedFromNullSystem).toEqual(BASE_FALLBACK_CONFIG);
  });

  it("should defensively filter malformed elements in tag arrays, model configs, role mappings, and guild metadata", () => {
    const systemRowWithMixedSafety: DirectusSystemConfigRaw = {
      id: "sys-mixed",
      ai_safety_settings: [
        { category: "VALID_CAT", threshold: "BLOCK_NONE" },
        { category: 123, threshold: "BLOCK_NONE" },
        "bad-entry",
      ] as unknown as DirectusSystemConfigRaw["ai_safety_settings"],
    };

    const rowWithMixedFields: DirectusGuildConfigRaw = {
      id: "row-mixed",
      guild_id: "guild-mixed",
      reply_channel_ids: ["ch-1", 42, null, "ch-2"] as unknown as string[],
      roast_ignored_channel_ids: "bad" as unknown as string[],
      voice_bouncer_tag_only_channel_ids: 99 as unknown as string[],
      voice_bouncer_tag_only_category_ids: [
        "cat-1",
        false,
      ] as unknown as string[],
      voice_bouncer_exempt_role_ids: {} as unknown as string[],
      smart_reply_classifier_model: {
        modelId: "",
      },
      smart_reply_chat_bot_model: {
        modelId: "gemini-3.8-flash",
        provider: "invalid-provider" as unknown as "google-genai",
        temperature: 0.4,
      },
      valorant_rank_role_mappings: {
        Radiant: "role-rad",
        Immortal: 123,
      } as unknown as Record<string, string>,
      guild_emojis: {
        "🔥": ["fire", 123],
        "💀": "not-an-array",
      } as unknown as Record<string, string[]>,
      guild_members: [
        { username: "valid", name: "Valid", gender: "other" },
        { username: "missing-gender", name: "Bad" },
        null,
      ] as unknown as DirectusGuildConfigRaw["guild_members"],
    };

    const mapped = mapDirectusToAppConfig(
      systemRowWithMixedSafety,
      [rowWithMixedFields],
      BASE_FALLBACK_CONFIG,
    );

    expect(mapped.aiSafetySettings).toEqual({
      safetySettings: [{ category: "VALID_CAT", threshold: "BLOCK_NONE" }],
    });
    const guild = mapped.bots.chatBot.guilds["guild-mixed"];
    expect(guild.replyChannelIds).toEqual(["ch-1", "ch-2"]);
    expect(guild.roast).toBeUndefined();
    expect(guild.voiceBouncer).toEqual({
      tagOnlyCategoryIds: ["cat-1"],
    });
    expect(guild.smartReply?.classifierModel).toBeUndefined();
    expect(guild.smartReply?.chatBotModel).toEqual({
      modelId: "gemini-3.8-flash",
      temperature: 0.4,
    });
    expect(guild.valorant?.features?.rankRoleSync?.roleMappings).toEqual({
      Radiant: "role-rad",
    });
    expect(mapped.guildEmojis["guild-mixed"]).toEqual({
      "🔥": ["fire"],
    });
    expect(mapped.guildMembers["guild-mixed"]).toEqual([
      { username: "valid", name: "Valid", gender: "other" },
    ]);
  });

  it("should deeply isolate cloned output from fallbackLocalConfig and input payloads", () => {
    const fallbackSnapshot = structuredClone(BASE_FALLBACK_CONFIG);
    const mapped = mapDirectusToAppConfig(null, [], BASE_FALLBACK_CONFIG);

    mapped.bots.chatBot.guilds.injected = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
    };
    mapped.guildEmojis["fallback-guild"]["👍"].push("mutated");
    mapped.guildMembers["fallback-guild"][0].name = "Mutated";
    mapped.aiSafetySettings.safetySettings.push({
      category: "NEW",
      threshold: "BLOCK_NONE",
    });

    expect(BASE_FALLBACK_CONFIG).toEqual(fallbackSnapshot);

    const inputGuild: BotGuildConfig = {
      replyChannelIds: ["ch-1"],
      ignoredChannelIds: ["ch-2"],
      respondToMentions: true,
      chatBotModel: { modelId: "gemini-3.8-flash", temperature: 0.5 },
      smartReply: {
        classifierModel: { modelId: "gemini-3.5-flash-lite" },
      },
      roast: {
        allowedChannelIds: ["r-1"],
      },
      valorant: {
        features: {
          rankRoleSync: {
            roleMappings: { Gold: "role-gold" },
          },
        },
      },
    };
    const inputGuildSnapshot = structuredClone(inputGuild);

    const payload = mapBotGuildConfigToDirectusPayload(
      "chatBot",
      "g-immut",
      inputGuild,
    );
    payload.reply_channel_ids?.push("mutated-ch");
    payload.ignored_channel_ids?.push("mutated-ign");
    if (payload.chat_bot_model) {
      payload.chat_bot_model.temperature = 0.99;
    }
    if (payload.smart_reply_classifier_model) {
      payload.smart_reply_classifier_model.modelId = "mutated";
    }
    payload.roast_allowed_channel_ids?.push("mutated-r");
    if (payload.valorant_rank_role_mappings) {
      payload.valorant_rank_role_mappings.Gold = "mutated-role";
    }

    expect(inputGuild).toEqual(inputGuildSnapshot);

    const sysInput = {
      aiSafetySettings: {
        safetySettings: [{ category: "CAT", threshold: "BLOCK_NONE" }],
      },
    };
    const sysPayload = mapAppConfigToDirectusSystemPayload(sysInput);
    if (
      sysPayload.ai_safety_settings &&
      !Array.isArray(sysPayload.ai_safety_settings)
    ) {
      sysPayload.ai_safety_settings.safetySettings[0].threshold = "MUTATED";
    }
    expect(sysInput.aiSafetySettings.safetySettings[0].threshold).toBe(
      "BLOCK_NONE",
    );
  });

  it("should reject prototype-polluting keys and validate scalar/enum/finite-number fields", () => {
    expect(isSafeRecordKey("__proto__")).toBe(false);
    expect(isSafeRecordKey("constructor")).toBe(false);
    expect(isSafeRecordKey("prototype")).toBe(false);
    expect(isSafeRecordKey("")).toBe(false);
    expect(isSafeRecordKey("guild-1")).toBe(true);

    const maliciousSystem: DirectusSystemConfigRaw = {
      id: "sys-bad",
      ai_provider:
        "invalid-provider" as unknown as DirectusSystemConfigRaw["ai_provider"],
      ai_model_id: "",
      ai_max_output_tokens: Number.NaN,
      ai_max_conversation_history: -5,
    };

    const protoGuildRow = JSON.parse(
      '{"id":"r1","guild_id":"__proto__","bot_id":"constructor","roast_enabled":true}',
    ) as DirectusGuildConfigRaw;

    const normalGuildRow: DirectusGuildConfigRaw = {
      id: "r2",
      guild_id: "guild-safe",
      roast_max_intensity:
        "extreme" as unknown as DirectusGuildConfigRaw["roast_max_intensity"],
      roast_max_per_day: Number.POSITIVE_INFINITY,
      valorant_rank_role_mappings: JSON.parse(
        '{"__proto__":"evil","Radiant":"role-rad"}',
      ) as Record<string, string>,
      guild_emojis: JSON.parse(
        '{"constructor":["bad"],"🔥":["fire"]}',
      ) as Record<string, string[]>,
    };

    const mapped = mapDirectusToAppConfig(
      maliciousSystem,
      [protoGuildRow, normalGuildRow],
      BASE_FALLBACK_CONFIG,
    );

    expect(mapped.aiProvider).toBe(BASE_FALLBACK_CONFIG.aiProvider);
    expect(mapped.aiModelId).toBe(BASE_FALLBACK_CONFIG.aiModelId);
    expect(mapped.aiMaxOutputTokens).toBe(
      BASE_FALLBACK_CONFIG.aiMaxOutputTokens,
    );
    expect(mapped.aiMaxConversationHistory).toBe(
      BASE_FALLBACK_CONFIG.aiMaxConversationHistory,
    );
    expect(Object.hasOwn(mapped.bots, "constructor")).toBe(false);
    expect(Object.hasOwn(mapped.bots.chatBot.guilds, "__proto__")).toBe(false);
    expect(({} as Record<string, unknown>).roast_enabled).toBeUndefined();

    const safeGuild = mapped.bots.chatBot.guilds["guild-safe"];
    expect(safeGuild.roast?.maxIntensity).toBeUndefined();
    expect(safeGuild.roast?.maxPerDay).toBeUndefined();
    expect(safeGuild.valorant?.features?.rankRoleSync?.roleMappings).toEqual({
      Radiant: "role-rad",
    });
    expect(Object.hasOwn(mapped.guildEmojis["guild-safe"], "constructor")).toBe(
      false,
    );
    expect(mapped.guildEmojis["guild-safe"]).toEqual({ "🔥": ["fire"] });
  });

  it("should deep-clone fallback guild configs and map partial payloads without inventing defaults", () => {
    const fallbackWithNested: AppConfigData =
      structuredClone(BASE_FALLBACK_CONFIG);
    fallbackWithNested.bots.chatBot.guilds["fallback-guild"].valorant = {
      enabled: true,
      features: { compare: { enabled: true } },
    };

    const mapped = mapDirectusToAppConfig(null, [], fallbackWithNested);
    if (mapped.bots.chatBot.guilds["fallback-guild"].valorant) {
      mapped.bots.chatBot.guilds["fallback-guild"].valorant.enabled = false;
    }
    expect(
      fallbackWithNested.bots.chatBot.guilds["fallback-guild"].valorant
        ?.enabled,
    ).toBe(true);

    const partialPayload = mapPartialBotGuildConfigToDirectusPayload({
      valorant: {
        enabled: true,
        features: { compare: { enabled: false } },
      },
    });
    expect(partialPayload).toEqual({
      valorant_enabled: true,
      valorant_compare_enabled: false,
    });
    expect("reply_channel_ids" in partialPayload).toBe(false);
    expect("respond_to_mentions" in partialPayload).toBe(false);
  });
});
