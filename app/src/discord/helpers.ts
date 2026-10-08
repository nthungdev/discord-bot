import fs from "node:fs";
import path from "node:path";
import { userMention } from "discord.js";
import type { DiscordUser } from "../types";

/**
 * Regex matching Discord user mentions (e.g. <@123456789> or <@!123456789>) enclosed in single inline code backticks.
 * Uses negative lookbehind/lookahead and horizontal whitespace so multiline fenced code blocks (```)
 * are never treated as inline mention wrappers.
 */
const WRAPPED_USER_MENTION_REGEX =
  /(?<!`)`[^\S\r\n]*(<@!?\d+>)[^\S\r\n]*`(?!`)/g;

/**
 * Regex matching standard @username mentions (not preceded by '<' to avoid matching raw Discord mentions like <@123>).
 */
const AT_HANDLE_REGEX = /(?<!<)@((\.?(?:[\w]+\.)*\w+)\.?)/g;

/**
 * Regex matching bracketed pseudo-mentions like <@username> or @<username> (excluding raw numeric mentions like <@123> or <@!123>).
 */
const BRACKETED_PSEUDO_MENTION_REGEX =
  /(?:<@|@<)(?!!?\d+>)((\.?(?:[\w]+\.)*\w+)\.?)>/g;

/**
 * Escapes characters with special meaning in regular expressions.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces nicknames containing spaces or special characters with user mentions.
 */
function replaceSpacedNicknames(
  content: string,
  serverMembers: readonly DiscordUser[],
): string {
  let updatedContent = content;

  for (const member of serverMembers) {
    if (!member.nickname?.includes(" ")) {
      continue;
    }
    const escaped = escapeRegex(member.nickname);
    const bracketRegex = new RegExp(`(?:<@|@<)${escaped}>`, "gi");
    updatedContent = updatedContent.replace(
      bracketRegex,
      userMention(member.id),
    );

    const boundary = /\w$/.test(member.nickname) ? "\\b" : "";
    const regex = new RegExp(`(?<!<)@${escaped}${boundary}`, "gi");
    updatedContent = updatedContent.replace(regex, userMention(member.id));
  }

  return updatedContent;
}

/**
 * Replaces standard token usernames or nicknames with Discord user mentions.
 */
function replaceTokenMentions(
  content: string,
  serverMembers: readonly DiscordUser[],
): string {
  const mentionMatches = new Set<string>();

  for (const match of content.matchAll(AT_HANDLE_REGEX)) {
    const [, withDot, withoutDot] = match;
    mentionMatches.add(withDot);
    mentionMatches.add(withoutDot);
  }

  for (const match of content.matchAll(BRACKETED_PSEUDO_MENTION_REGEX)) {
    const [, withDot, withoutDot] = match;
    mentionMatches.add(withDot);
    mentionMatches.add(withoutDot);
  }

  let updatedContent = content;
  for (const mentionedName of mentionMatches) {
    const lower = mentionedName.toLowerCase();
    const serverMember = serverMembers.find(
      (m) =>
        lower === m.username.toLowerCase() ||
        (m.nickname && lower === m.nickname.toLowerCase()),
    );

    if (serverMember) {
      const mention = userMention(serverMember.id);
      if (!/^\d+$/.test(mentionedName)) {
        updatedContent = updatedContent.replaceAll(
          `<@${mentionedName}>`,
          mention,
        );
      }
      updatedContent = updatedContent.replaceAll(
        `@<${mentionedName}>`,
        mention,
      );

      const boundary = /\w$/.test(mentionedName) ? "\\b" : "";
      const atRegex = new RegExp(
        `(?<!<)@${escapeRegex(mentionedName)}${boundary}`,
        "gi",
      );
      updatedContent = updatedContent.replace(atRegex, mention);
    }
  }

  return updatedContent;
}

/**
 * Strips markdown code backticks enclosing Discord user mentions so Discord renders interactive mention pills.
 */
function unwrapMentionBackticks(content: string): string {
  return content.replace(WRAPPED_USER_MENTION_REGEX, "$1");
}

/**
 * Replaces username handles and pseudo-mentions with Discord interactive user mentions,
 * and strips any surrounding markdown code backticks so Discord renders interactive mention pills.
 *
 * @param message - The raw text message to process.
 * @param serverMembers - List of guild members used to resolve usernames and nicknames to IDs.
 * @returns The transformed message with unwrapped, interactive Discord user mentions.
 */
export const replaceWithUserMentions = (
  message: string,
  serverMembers?: readonly DiscordUser[],
): string => {
  if (!message) {
    return message;
  }

  let processed = message;

  if (serverMembers && serverMembers.length > 0) {
    processed = replaceSpacedNicknames(processed, serverMembers);
    processed = replaceTokenMentions(processed, serverMembers);
  }

  return unwrapMentionBackticks(processed);
};

export const parseCommands = async () => {
  const commands = [];
  // Grab all the command folders from the commands directory
  const foldersPath = path.join(__dirname, "commands");
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    // Skip helper folders that contain utilities, not slash command definitions
    if (folder === "utilities") continue;

    // Grab all the command files from the commands directory
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter(
        (file) =>
          (file.endsWith(".ts") || file.endsWith(".js")) &&
          !file.includes(".test.") &&
          !file.includes(".spec.") &&
          !file.endsWith(".d.ts"),
      );
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = await import(filePath);
      if ("data" in command && "execute" in command) {
        commands.push(command);
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  }
  return commands;
};
