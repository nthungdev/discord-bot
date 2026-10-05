import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  Locale,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import { executeRoast } from "../../../services/roast/handler";
import { DiscordCommand } from "../../constants";

export const data = new ContextMenuCommandBuilder()
  .setName(DiscordCommand.RoastUser)
  .setNameLocalizations({
    [Locale.Vietnamese]: "Chan người này",
    [Locale.EnglishUS]: "Roast User",
  })
  .setType(ApplicationCommandType.User);

export async function execute(
  interaction: UserContextMenuCommandInteraction,
): Promise<void> {
  await executeRoast(interaction);
}
