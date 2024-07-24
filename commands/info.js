import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { buildUserInfos, getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription("Check your infos related to the bot"),
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

        // Check if the user is linked
        const user = await DB.getUser(discordId);
        if (!user) {
            return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked")});
        }

        const profileInfos = buildUserInfos(server.language, user);
            
        return interaction.editReply({ embeds: [profileInfos]});
    }
}
