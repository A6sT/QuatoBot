import { Client, CommandInteraction } from "discord.js";

/**
 * 
 * @param {Client} client 
 * @param {CommandInteraction} interaction 
 * @returns
 */
export const handleCommand = async (client, interaction) => {
    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.log("==============");
        console.error(error);
        console.log("==============");
    }
}