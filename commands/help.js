import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { buildUserInfos, getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("Need some help on how to use the bot ? This is what you're looking for !"),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
    async execute(interaction) {
        const serverId = interaction.guildId;
        const server = await DB.getServer(serverId);
        const lang = server.language;
        const discordId = interaction.member.id;

        await interaction.deferReply({ephemeral: true});

        let description = `Documentation can be found [here](https://github.com/A6sT/QuaToBot)`;
            
        return interaction.editReply({ content: description });
    }
}
