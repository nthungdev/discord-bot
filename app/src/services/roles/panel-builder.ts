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
import {
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_WITTY_GREETINGS,
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

  embed.setFooter({
    text:
      panel.mode === "single"
        ? "Single choice mode (selecting a new role replaces previous)"
        : "Multi-select mode (click to toggle roles)",
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
  if (panel.type === "dropdown") {
    return buildSelectMenuRow(panel, guild);
  }
  return buildButtonRows(panel, guild);
}

/**
 * Formats custom welcome greeting with {user}, {server}, and {count} tokens.
 */
export function buildWelcomeGreeting(
  template: string | undefined,
  member: GuildMember,
): string {
  let base = template;
  if (!base) {
    const idx = Math.floor(Math.random() * DEFAULT_WITTY_GREETINGS.length);
    base = DEFAULT_WITTY_GREETINGS[idx] || DEFAULT_WELCOME_MESSAGE;
  }
  return base
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", member.guild.memberCount.toString());
}
