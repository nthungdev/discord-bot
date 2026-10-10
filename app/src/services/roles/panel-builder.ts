import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { DiscordUser } from "../../types";
import { generateChatMessageWithGenAi, getGenAi } from "../../utils/genAi";
import { getGuildLocaleStore } from "../locale/store";
import {
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_WELCOME_MESSAGE_VI,
  DEFAULT_WITTY_GREETINGS,
  DEFAULT_WITTY_GREETINGS_VI,
  DISCORD_MAX_MESSAGE_LENGTH,
  MAX_BUTTONS_PER_ROW,
  MAX_DROPDOWN_OPTIONS,
  MAX_TOTAL_BUTTONS,
  ROLE_BUTTON_PREFIX,
  ROLE_SELECT_PREFIX,
} from "./constants";
import type { RoleOption, RolePanel } from "./types";

/**
 * Filter roles that currently exist in the guild cache (if guild is provided).
 */
export function filterValidPanelRoles(
  roles: readonly RoleOption[],
  guild?: Guild,
): RoleOption[] {
  if (!guild) return [...roles];
  return roles.filter((opt) => guild.roles.cache.has(opt.roleId));
}

/**
 * Builds the standard Embed for a published role panel.
 */
export function buildPanelEmbed(panel: RolePanel): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description || "Select your roles below:")
    .setColor(0x5865f2);

  if (panel.roles.length > 0) {
    const roleList = panel.roles
      .map((r) => {
        const emojiStr = r.emoji ? `${r.emoji} ` : "";
        return `• ${emojiStr}**${r.label}** (<@&${r.roleId}>)`;
      })
      .join("\n");

    if (roleList.length <= 1024) {
      embed.addFields({
        name: "Available Roles",
        value: roleList,
      });
    }
  }

  let footerText: string;
  if (panel.type === "emoji") {
    footerText =
      panel.mode === "single"
        ? "React with an emoji to claim a role (single choice). Remove reaction to remove the role."
        : "React with an emoji below to claim a role. Remove reaction to remove the role.";
  } else {
    footerText =
      panel.mode === "single"
        ? "Single choice mode (selecting a new role replaces previous)"
        : "Multi-select mode (click to toggle roles)";
  }

  embed.setFooter({
    text: footerText,
  });

  return embed;
}

/**
 * Builds ActionRowBuilder rows containing buttons for a panel.
 * Chunks roles into rows of 5, up to a maximum of 25 buttons (5 rows).
 */
export function buildButtonRows(
  panel: RolePanel,
  guild?: Guild,
): ActionRowBuilder<ButtonBuilder>[] {
  const validRoles = filterValidPanelRoles(panel.roles, guild);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (
    let i = 0;
    i < validRoles.length && i < MAX_TOTAL_BUTTONS;
    i += MAX_BUTTONS_PER_ROW
  ) {
    const chunk = validRoles.slice(i, i + MAX_BUTTONS_PER_ROW);
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const opt of chunk) {
      const btn = new ButtonBuilder()
        .setCustomId(`${ROLE_BUTTON_PREFIX}${panel.id}:${opt.roleId}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary);

      if (opt.emoji) {
        btn.setEmoji(opt.emoji);
      }

      row.addComponents(btn);
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Builds a StringSelectMenu ActionRow for a dropdown panel.
 */
export function buildSelectMenuRow(
  panel: RolePanel,
  guild?: Guild,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const validRoles = filterValidPanelRoles(panel.roles, guild);
  if (validRoles.length === 0) {
    return [];
  }

  const cappedRoles = validRoles.slice(0, MAX_DROPDOWN_OPTIONS);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${ROLE_SELECT_PREFIX}${panel.id}`)
    .setPlaceholder(
      panel.mode === "single"
        ? "Choose a role from the list..."
        : "Select one or more roles...",
    );

  if (panel.mode === "single") {
    selectMenu.setMinValues(1).setMaxValues(1);
  } else {
    selectMenu.setMinValues(0).setMaxValues(cappedRoles.length);
  }

  const options = cappedRoles.map((opt) => {
    const optionBuilder = new StringSelectMenuOptionBuilder()
      .setLabel(opt.label)
      .setValue(opt.roleId);

    if (opt.emoji) {
      optionBuilder.setEmoji(opt.emoji);
    }

    if (opt.description) {
      optionBuilder.setDescription(opt.description.slice(0, 100));
    }

    return optionBuilder;
  });

  selectMenu.addOptions(options);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
  ];
}

/**
 * Builds component ActionRow arrays according to panel.type ('button' | 'dropdown').
 */
export function buildPanelComponents(
  panel: RolePanel,
  guild?: Guild,
): (
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>
)[] {
  if (panel.type === "emoji") {
    return [];
  }
  if (panel.type === "dropdown") {
    return buildSelectMenuRow(panel, guild);
  }
  return buildButtonRows(panel, guild);
}

/**
 * Parses and maps a raw locale string to a supported role locale ('vi' or 'en-US').
 */
function parseLocalePrefix(locale?: string | null): "vi" | "en-US" | null {
  if (!locale) return null;
  const lower = locale.toLowerCase();
  if (lower.startsWith("vi")) return "vi";
  if (lower.startsWith("en")) return "en-US";
  return null;
}

/**
 * Reads persistent guild locale setting if available.
 */
function getStoredGuildLocale(guildId?: string | null): "vi" | "en-US" | null {
  if (!guildId) return null;
  try {
    const stored = getGuildLocaleStore().getLocale(guildId);
    return stored === "vi" || stored === "en-US" ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the appropriate locale for role greetings and onboarding:
 * 1. Explicit locale override (e.g. from command / OnboardingConfig)
 * 2. Persistent Server/Guild Locale Override (getGuildLocaleStore().getLocale(guildId))
 * 3. Guild Discord preferredLocale (if available and starts with vi / en)
 * 4. Default fallback: "vi"
 */
export function resolveRoleLocale(
  guildId?: string | null,
  localeOverride?: string | null,
  guildPreferredLocale?: string | null,
): "vi" | "en-US" {
  return (
    parseLocalePrefix(localeOverride) ??
    getStoredGuildLocale(guildId) ??
    parseLocalePrefix(guildPreferredLocale) ??
    "vi"
  );
}

/**
 * Formats custom welcome greeting with {user}, {server}, and {count} tokens,
 * selecting localized witty defaults if no template is provided.
 */
export function buildWelcomeGreeting(
  template: string | undefined,
  member: GuildMember,
  localeOverride?: string | null,
): string {
  const locale = resolveRoleLocale(
    member.guild.id,
    localeOverride,
    member.guild.preferredLocale,
  );

  let base = template;
  if (!base) {
    const list =
      locale === "en-US" ? DEFAULT_WITTY_GREETINGS : DEFAULT_WITTY_GREETINGS_VI;
    const idx = Math.floor(Math.random() * list.length);
    const defaultMsg =
      locale === "en-US" ? DEFAULT_WELCOME_MESSAGE : DEFAULT_WELCOME_MESSAGE_VI;
    base = list[idx] || defaultMsg;
  }
  return base
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", member.guild.memberCount.toString());
}

/**
 * Generates a dynamic witty welcome message using GenAI in the appropriate locale,
 * falling back to curated localized witty greetings if GenAI is unavailable.
 */
export async function generateWittyWelcomeGreeting(
  member: GuildMember,
  localeOverride?: string | null,
): Promise<string> {
  const locale = resolveRoleLocale(
    member.guild.id,
    localeOverride,
    member.guild.preferredLocale,
  );
  const isEn = locale === "en-US";

  try {
    const systemInstruction = isEn
      ? "You are a witty, playful Discord bot. Generate a fun, witty, and concise welcome message (1-2 sentences) in English welcoming a new member to the server. Mention the user with {user}, mention server with {server}. Keep it under 200 characters, charming, and without markdown headers or quotes."
      : "Bạn là một bot Discord hài hước, dí dỏm và thân thiện. Hãy tạo một câu chào mừng vui nhộn, ngắn gọn (1-2 câu) bằng TIẾNG VIỆT chào đón thành viên mới vào server. Nhắc đến user bằng {user}, server bằng {server}. Giữ dưới 200 ký tự, hóm hỉnh, không dùng markdown headers hay dấu ngoặc kép.";

    const userPrompt = isEn
      ? `New member ${member.displayName} (username: ${member.user.username}) just joined ${member.guild.name}. They are member #${member.guild.memberCount}. Welcome them with comedic flair!`
      : `Thành viên mới ${member.displayName} (username: ${member.user.username}) vừa tham gia ${member.guild.name}. Họ là thành viên thứ #${member.guild.memberCount}. Hãy chào đón họ thật hài hước, duyên dáng!`;

    const genAi = getGenAi({
      apiKey: process.env.AI_API_KEY,
      guildId: member.guild.id,
      systemInstruction,
    });

    const users: DiscordUser[] = [
      {
        id: member.id,
        username: member.user.username,
        nickname: member.displayName,
      },
    ];

    const result = await generateChatMessageWithGenAi(
      genAi,
      { text: userPrompt },
      users,
      member.guild,
    );

    let content = result.content?.replace(/^["']|["']$/g, "").trim();
    if (content) {
      content = content
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", member.guild.memberCount.toString());

      if (!content.includes(`<@${member.id}>`)) {
        const prefix = isEn
          ? `Welcome <@${member.id}>!`
          : `Chào mừng <@${member.id}>!`;
        content = `${prefix} ${content}`;
      }

      if (content.length > DISCORD_MAX_MESSAGE_LENGTH) {
        console.warn(
          `[RoleService] Generated witty welcome greeting exceeds ${DISCORD_MAX_MESSAGE_LENGTH} characters (${content.length}), falling back to curated greeting.`,
        );
        return buildWelcomeGreeting(undefined, member, localeOverride);
      }

      return content;
    }
  } catch (error) {
    console.warn(
      "[RoleService] GenAI welcome greeting generation failed, using witty fallback:",
      error,
    );
  }

  return buildWelcomeGreeting(undefined, member, localeOverride);
}
