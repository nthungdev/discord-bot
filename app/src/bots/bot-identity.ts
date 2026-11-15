import type { Guild } from "discord.js";
import type { BotGuildConfig } from "../config/types";

export const DEFAULT_BOT_NAME = "ChatBot";

export interface BotIdentity {
  name: string;
  aliases: string[];
}

export interface BotIdentitySources {
  liveNickname?: string | null;
  configBotName?: string;
  username?: string | null;
  lockName?: boolean;
}

function normalizeName(name?: string | null): string | undefined {
  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeNames(names: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * Resolves the bot's primary name and aliases from candidate name sources.
 * Priority: live guild nickname -> config `botName` -> client username, unless
 * `lockName` is set, in which case config `botName` wins and the nickname becomes an alias.
 * Aliases are the other distinct names (case-insensitive), excluding the primary name.
 */
export function resolveBotIdentity({
  liveNickname,
  configBotName,
  username,
  lockName = false,
}: BotIdentitySources): BotIdentity {
  const live = normalizeName(liveNickname);
  const configured = normalizeName(configBotName);
  const user = normalizeName(username);

  const ordered =
    lockName && configured
      ? [configured, live, user]
      : [live, configured, user];
  const [name = DEFAULT_BOT_NAME, ...aliases] = dedupeNames(ordered);
  return { name, aliases };
}

/**
 * Resolves the bot identity for a guild from the live member cache and guild config.
 * `members.me` is kept current by discord.js on guildMemberUpdate, so nickname
 * changes apply on the next message without a restart.
 */
export function getGuildBotIdentity(
  guild: Guild | null | undefined,
  guildConfig?: Pick<BotGuildConfig, "botName" | "lockName">,
): BotIdentity {
  return resolveBotIdentity({
    // `nickname`, not `displayName`: displayName falls back to the username and would outrank config botName.
    liveNickname: guild?.members?.me?.nickname,
    configBotName: guildConfig?.botName,
    username: guild?.client?.user?.username,
    lockName: guildConfig?.lockName,
  });
}
