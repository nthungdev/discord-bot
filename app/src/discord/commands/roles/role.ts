import {
  type ChatInputCommandInteraction,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getRoleService } from "../../../services/roles";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Role)
  .setDescription("Staff utilities to directly assign or remove roles.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("give")
      .setDescription("Assign a role to a server member.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Target member to grant the role to")
          .setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Role to assign").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Revoke a role from a server member.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Target member to revoke the role from")
          .setRequired(true),
      )
      .addRoleOption((opt) =>
        opt.setName("role").setDescription("Role to revoke").setRequired(true),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "⚠️ This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const caller = interaction.member as GuildMember;
  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser("user", true);
  const roleOption = interaction.options.getRole("role", true);

  const targetMember = await guild.members
    .fetch(targetUser.id)
    .catch(() => null);
  if (!targetMember) {
    await interaction.reply({
      content: "⚠️ Target user is not a member of this server.",
      ephemeral: true,
    });
    return;
  }

  const role = guild.roles.cache.get(roleOption.id);
  if (!role) {
    await interaction.reply({
      content: "⚠️ Target role was not found in this server.",
      ephemeral: true,
    });
    return;
  }

  const roleService = getRoleService();

  if (subcommand === "give") {
    const result = await roleService.giveRole(
      guild,
      caller,
      targetMember,
      role,
    );
    await interaction.reply({
      content: result.message,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "remove") {
    const result = await roleService.removeRole(
      guild,
      caller,
      targetMember,
      role,
    );
    await interaction.reply({
      content: result.message,
      ephemeral: true,
    });
  }
}
