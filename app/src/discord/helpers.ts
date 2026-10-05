import fs from "node:fs";
import path from "node:path";
import { userMention } from "discord.js";
import type { DiscordUser } from "../types";

export const replaceWithUserMentions = (
  message: string,
  serverMembers: DiscordUser[],
): string => {
  if (!(message && serverMembers?.length)) return message;
  let messageWithMentions = message;

  // 1. Replace exact @nickname for members with spaces or non-word characters in nickname
  for (const member of serverMembers) {
    if (member.nickname?.includes(" ")) {
      const escaped = member.nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`@${escaped}\\b`, "gi");
      messageWithMentions = messageWithMentions.replace(
        regex,
        userMention(member.id),
      );
    }
  }

  // 2. Token-based matching for standard word tokens
  const mentionMatches = new Set<string>();
  [...messageWithMentions.matchAll(/(?<=@)((\.?(?:[\w]+\.)*\w+)\.?)/g)].forEach(
    (match) => {
      const [, withDot, withoutDot] = match;
      mentionMatches.add(withDot);
      mentionMatches.add(withoutDot);
    },
  );

  messageWithMentions = [...mentionMatches].reduce((acc, mentionedName) => {
    const lower = mentionedName.toLowerCase();
    const serverMember = serverMembers.find(
      (m) =>
        lower === m.username.toLowerCase() ||
        (m.nickname && lower === m.nickname.toLowerCase()),
    );
    return serverMember
      ? acc.replaceAll(`@${mentionedName}`, userMention(serverMember.id))
      : acc;
  }, messageWithMentions);

  return messageWithMentions;
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
