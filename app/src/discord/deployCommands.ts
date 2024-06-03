import {  REST,RESTPutAPIApplicationCommandsResult, Routes } from 'discord.js'
import { parseCommands } from './helpers';

export const deployGuildCommands = async (token: string, clientId: string, guildId: string) => {
  const commandsToReg = parseCommands().map(command => command.data.toJSON())

  // Construct and prepare an instance of the REST module
  const rest = new REST().setToken(token);

  // deploy commands
  try {
    console.log(`Started refreshing ${commandsToReg.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandsToReg },
    ) as RESTPutAPIApplicationCommandsResult;

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
}