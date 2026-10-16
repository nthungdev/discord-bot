/**
 * Voice Companion Slash Command.
 * Subcommands: /voice join, leave, pause, resume, status, opt-out.
 */

import {
  type BaseGuildVoiceChannel,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  SlashCommandBuilder,
} from "discord.js";
import { Config } from "../../../config";
import { isVoiceCompanionEnabled } from "../../../config/types";
import { getVoiceManager } from "../../../services/voice/voice-manager";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Voice)
  .setDescription("Voice Companion management and conversation controls.")
  .addSubcommand((sub) =>
    sub
      .setName("join")
      .setDescription("Connects the Voice Companion to a voice channel.")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription(
            "The voice channel to join (defaults to your current voice channel).",
          )
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("leave")
      .setDescription(
        "Disconnects the Voice Companion from the voice channel.",
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("pause")
      .setDescription("Temporarily pauses listening and responding in voice."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("resume")
      .setDescription("Resumes listening and active participation in voice."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription(
        "Displays current Voice Companion session telemetry and status.",
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("opt-out")
      .setDescription("Toggles voice processing opt-out for your user profile.")
      .addBooleanOption((opt) =>
        opt
          .setName("enabled")
          .setDescription(
            "True to opt out of voice processing, False to opt back in.",
          )
          .setRequired(false),
      ),
  );

/**
 * Executes /voice subcommands.
 */
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used within a server.",
      ephemeral: true,
    });
    return;
  }

  const guildConfig = Config.getInstance().getBotGuildConfig(
    "chatBot",
    guild.id,
  );

  if (!isVoiceCompanionEnabled(guildConfig)) {
    await interaction.reply({
      content: "Voice Companion is not enabled on this server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const voiceManager = getVoiceManager();

  switch (subcommand) {
    case "join": {
      await handleJoin(interaction, guildConfig?.voiceCompanion);
      return;
    }
    case "leave": {
      await handleLeave(interaction);
      return;
    }
    case "pause": {
      const ok = voiceManager.pauseSession(guild.id);
      await interaction.reply({
        content: ok
          ? "⏸️ Voice Companion paused. I will not listen or speak until resumed."
          : "Voice Companion is not currently in a voice channel.",
        ephemeral: true,
      });
      return;
    }
    case "resume": {
      const ok = voiceManager.resumeSession(guild.id);
      await interaction.reply({
        content: ok
          ? "▶️ Voice Companion resumed. Ready to talk!"
          : "Voice Companion is not currently in a voice channel.",
        ephemeral: true,
      });
      return;
    }
    case "status": {
      await handleStatus(interaction);
      return;
    }
    case "opt-out": {
      const optOut = interaction.options.getBoolean("enabled", false) ?? true;
      voiceManager.optOutUser(guild.id, interaction.user.id, optOut);
      await interaction.reply({
        content: optOut
          ? "🔒 You have **opted out** of Voice Companion processing. Your audio will be discarded immediately."
          : "🔓 You have **opted in** to Voice Companion processing.",
        ephemeral: true,
      });
      return;
    }
    default: {
      await interaction.reply({
        content: `Unknown voice subcommand: ${subcommand}`,
        ephemeral: true,
      });
    }
  }
}

async function handleJoin(
  interaction: ChatInputCommandInteraction,
  companionConfig?: {
    modelId?: string;
    voiceName?: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";
    systemInstruction?: string;
  },
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const member = interaction.member as GuildMember | null;
  const targetChannel = (interaction.options.getChannel("channel", false) ??
    member?.voice.channel) as BaseGuildVoiceChannel | null;

  if (!targetChannel) {
    await interaction.reply({
      content:
        "You must be in a voice channel or specify a `channel` option to join.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    await getVoiceManager().joinChannel(guild, targetChannel, {
      modelId: companionConfig?.modelId,
      voiceName: companionConfig?.voiceName,
      systemInstruction: companionConfig?.systemInstruction,
    });

    await interaction.editReply({
      content: `🎙️ Joined voice channel <#${targetChannel.id}>! Full-duplex conversation is active. Speak naturally, interrupt anytime.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await interaction.editReply({
      content: `Failed to join voice channel: ${errorMsg}`,
    });
  }
}

async function handleLeave(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const left = getVoiceManager().leaveChannel(guild.id);
  await interaction.reply({
    content: left
      ? "👋 Disconnected from voice channel."
      : "Voice Companion is not currently in a voice channel.",
    ephemeral: true,
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const stats = getVoiceManager().getStats(guild.id);
  if (!stats) {
    await interaction.reply({
      content:
        "Voice Companion is not currently active in any channel on this server.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎙️ Voice Companion Session Status")
    .setColor(stats.status === "ACTIVE" ? 0x57f287 : 0xfee75c)
    .addFields(
      { name: "Channel", value: `<#${stats.channelId}>`, inline: true },
      { name: "Status", value: `\`${stats.status}\``, inline: true },
      { name: "Mode", value: `\`${stats.participationMode}\``, inline: true },
      {
        name: "Uptime",
        value: `${Math.floor(stats.uptimeSeconds / 60)}m ${stats.uptimeSeconds % 60}s`,
        inline: true,
      },
      {
        name: "Conversation Turns",
        value: `${stats.turnsCount}`,
        inline: true,
      },
      {
        name: "Barge-ins (Cutoffs)",
        value: `${stats.bargeInCount}`,
        inline: true,
      },
      {
        name: "Audio Ingress",
        value: `${stats.packetsReceived} packets`,
        inline: true,
      },
      {
        name: "Audio Egress",
        value: `${stats.packetsSent} packets`,
        inline: true,
      },
      {
        name: "Active Speakers",
        value: `${stats.activeSpeakersCount}`,
        inline: true,
      },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
