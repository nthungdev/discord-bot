import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { ValorantCardBuilder } from "../../../services/valorant/card-builder";
import {
  getValorantService,
  InvalidRiotIdFormatError,
} from "../../../services/valorant/valorant-service";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Riot)
  .setDescription("Riot Games account management")
  .addSubcommand((sub) =>
    sub
      .setName("link")
      .setDescription("Link your Discord account to your Riot Games ID")
      .addStringOption((opt) =>
        opt
          .setName("riot_id")
          .setDescription("Your Riot ID in Name#TAG format (e.g., TenZ#NA1)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("region")
          .setDescription("Your Riot account region")
          .setRequired(true)
          .addChoices(
            { name: "Asia Pacific (AP)", value: "ap" },
            { name: "North America (NA)", value: "na" },
            { name: "Europe (EU)", value: "eu" },
            { name: "Korea (KR)", value: "kr" },
            { name: "Latin America (LATAM)", value: "latam" },
            { name: "Brazil (BR)", value: "br" },
          ),
      ),
  );

/**
 * Executes `/riot` slash commands.
 */
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "link") {
    const riotId = interaction.options.getString("riot_id", true);
    const region = interaction.options.getString("region", true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const service = getValorantService();
      const { account } = await service.linkAccount(
        interaction.user.id,
        riotId,
        region,
      );
      const embed = ValorantCardBuilder.buildLinkSuccessEmbed(account, region);
      await interaction.editReply({ embeds: [embed] });
    } catch (err: unknown) {
      if (err instanceof InvalidRiotIdFormatError) {
        await interaction.editReply({
          content: `❌ ${err.message}`,
        });
        return;
      }
      await interaction.editReply({
        content: `❌ Failed to link Riot account: ${(err as Error).message}`,
      });
    }
    return;
  }

  await interaction.reply({
    content: `Unknown subcommand: ${subcommand}`,
    ephemeral: true,
  });
}
