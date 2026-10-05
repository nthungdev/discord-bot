import {
  REST,
  type RESTPutAPIApplicationCommandsResult,
  Routes,
} from "discord.js";
import { parseCommands } from "./helpers";

interface CommandOptionPayload {
  name: string;
  description: string;
  name_localizations?: Record<string, string> | null;
  description_localizations?: Record<string, string> | null;
}

interface CommandJsonPayload {
  name: string;
  description?: string;
  name_localizations?: Record<string, string> | null;
  description_localizations?: Record<string, string> | null;
  options?: CommandOptionPayload[];
}

/**
 * Strips English localization overrides from a command and its options.
 */
function stripEnglishLocalizations(
  cmd: CommandJsonPayload,
): CommandJsonPayload {
  delete cmd.name_localizations?.["en-US"];
  delete cmd.name_localizations?.["en-GB"];
  delete cmd.description_localizations?.["en-US"];
  delete cmd.description_localizations?.["en-GB"];

  for (const opt of cmd.options ?? []) {
    delete opt.name_localizations?.["en-US"];
    delete opt.name_localizations?.["en-GB"];
    delete opt.description_localizations?.["en-US"];
    delete opt.description_localizations?.["en-GB"];
  }
  return cmd;
}

const VIETNAMESE_SUBCOMMAND_MAP: Record<
  string,
  { name: string; description: string }
> = {
  "opt-out": {
    name: "tu-choi",
    description: "Từ chối tham gia bị chan",
  },
  "opt-in": {
    name: "tham-gia",
    description: "Bật lại khả năng tham gia bị chan",
  },
  status: {
    name: "trang-thai",
    description: "Xem trạng thái miễn nhiễm và khiên bảo vệ",
  },
};

/**
 * Transforms roast-shield command into a pure Vietnamese /chan-khien command.
 */
function transformShieldCommandToVietnamese(
  cmd: CommandJsonPayload,
): CommandJsonPayload {
  cmd.name = "chan-khien";
  cmd.description = "Quản lý miễn nhiễm chan và khiên bảo vệ.";
  delete cmd.name_localizations;
  delete cmd.description_localizations;

  for (const sub of cmd.options ?? []) {
    const mapped =
      VIETNAMESE_SUBCOMMAND_MAP[sub.name] ??
      VIETNAMESE_SUBCOMMAND_MAP[sub.name_localizations?.vi ?? ""];
    if (mapped) {
      sub.name = mapped.name;
      sub.description = mapped.description;
    }
    delete sub.name_localizations;
    delete sub.description_localizations;
  }
  return cmd;
}

/**
 * Transforms an individual command for Vietnamese server override.
 */
function transformCommandForVietnameseOverride(
  cmd: CommandJsonPayload,
): CommandJsonPayload {
  const cloned: CommandJsonPayload = JSON.parse(JSON.stringify(cmd));
  if (cloned.name === "chan") {
    return stripEnglishLocalizations(cloned);
  }
  if (cloned.name === "roast-shield") {
    return transformShieldCommandToVietnamese(cloned);
  }
  if (cloned.name === "Roast User") {
    cloned.name = "Chan người này";
    delete cloned.name_localizations;
    return cloned;
  }
  return cloned;
}

/**
 * Transforms an individual command for English server override.
 */
function transformCommandForEnglishOverride(
  cmd: CommandJsonPayload,
): CommandJsonPayload {
  const cloned: CommandJsonPayload = JSON.parse(JSON.stringify(cmd));
  if (cloned.name === "roast") {
    delete cloned.name_localizations?.vi;
    delete cloned.description_localizations?.vi;
  }
  return cloned;
}

/**
 * Transforms command schemas according to the guild's locale override setting (Option A).
 */
export function filterCommandsForGuildLocale(
  commands: CommandJsonPayload[],
  localeOverride?: string | null,
): CommandJsonPayload[] {
  if (localeOverride === "vi") {
    return commands
      .filter((cmd) => cmd.name !== "roast")
      .map(transformCommandForVietnameseOverride);
  }

  if (localeOverride === "en-US") {
    return commands
      .filter((cmd) => cmd.name !== "chan")
      .map(transformCommandForEnglishOverride);
  }

  return commands;
}

export const deployGuildCommands = async (
  token: string,
  clientId: string,
  guildId: string,
  localeOverride?: string | null,
) => {
  try {
    const rawCommands = (await parseCommands()).map((command) =>
      command.data.toJSON(),
    ) as CommandJsonPayload[];

    const commandsToReg = filterCommandsForGuildLocale(
      rawCommands,
      localeOverride,
    );

    const rest = new REST().setToken(token);

    console.log(
      `Started refreshing ${commandsToReg.length} application (/) commands for guild ${guildId} (localeOverride: ${localeOverride ?? "auto"}).`,
    );

    const data = (await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandsToReg },
    )) as RESTPutAPIApplicationCommandsResult;

    console.log(
      `Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`,
    );
  } catch (error) {
    console.error(error);
  }
};
