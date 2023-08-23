import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-channel')
        .setDescription("Set what and where to display players infos")
        .addStringOption(option =>
            option.setName('type')
                .setDescription("The type of info you want to display")
                .setRequired(true)
                .addChoices(
                    { name: 'Sessions', value: 'session' },
                    { name: 'Score-tracking', value: 'tracker' },
                    { name: 'Salles multijoueur', value: 'multiplayer' },
                )
        )
        .addChannelOption(option => option.setName('channel').setDescription("The channel you want to send the infos to").setRequired(true)),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const serverId = interaction.guildId;
            const server = await DB.getServer(serverId);
            const lang = server.language;
            const channel = interaction.options.getChannel('channel');
            const choice = interaction.options.getString('type');
            let name;

            await interaction.deferReply({ ephemeral: true });

            // Check si le channel existe
            if (channel.type != "GUILD_TEXT") {
                return interaction.editReply({ content: getLocale(lang, "commandChannelIsNotTextual", channel.toString()) });
            }

            // Sauvegarde du nouveau channel
            switch (choice) {
                case 'session':
                    await DB.setSessionChannel(serverId, channel.id);
                    name = getLocale(lang, "channelTypeSession");
                    break;

                case 'tracker':
                    await DB.setTrackerChannel(serverId, channel.id);
                    name = getLocale(lang, "channelTypeScoreTracking");
                    break;

                case 'multiplayer':
                    await DB.setMultiplayerChannel(serverId, channel.id);
                    name = getLocale(lang, "channelTypeMultiplayerRoom");
                    break;
            }
            
            return interaction.editReply({ content: getLocale(lang, "commandSetChannelChannelDefined", channel.toString(), name) });
        }
}
