import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChannelType } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('channel')
        .setDescription("Set what and where to display bot infos")
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a channel')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription("The type of channel you want to display")
                        .setRequired(true)
                        .addChoices(
                            { name: 'Sessions', value: 'session' },
                            { name: 'Score-tracking', value: 'tracker' },
                            { name: 'Announcements', value: 'announcement' },
                            { name: 'Challenges', value: 'challenge' }
                        )
                )
                .addChannelOption(option => option.setName('channel').setDescription("The channel you want to send the infos to").addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a channel')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription("The type of channel you want to remove")
                        .setRequired(true)
                        .addChoices(
                            { name: 'Sessions', value: 'session' },
                            { name: 'Score-tracking', value: 'tracker' },
                            { name: 'Announcements', value: 'announcement' },
                            { name: 'Challenges', value: 'challenge' }
                        )
                )
        ),
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

            const subCommand = interaction.options.getSubcommand();
            const selectedChannel = subCommand == "set" ? channel.id : "";

            let name;

            await interaction.deferReply({ ephemeral: true });

            // Save the new channel
            switch (choice) {
                case 'session':
                    await DB.setSessionChannel(serverId, selectedChannel);
                    name = getLocale(lang, "channelTypeSession");
                    break;

                case 'tracker':
                    await DB.setTrackerChannel(serverId, selectedChannel);
                    name = getLocale(lang, "channelTypeScoreTracking");
                    break;

                case 'announcement':
                    await DB.setAnnouncementChannel(serverId, selectedChannel);
                    name = getLocale(lang, "channelTypeAnnouncement");
                    break;
                case 'challenge':
                    await DB.setChallengeChannel(serverId, selectedChannel);
                    name = getLocale(lang, "channelTypeChallenge");
                    break;
            }

            if (subCommand == "set") {
                return interaction.editReply({ content: getLocale(lang, "commandSetChannelChannelDefined", channel.toString(), name) });
            }
            return interaction.editReply({ content: getLocale(lang, "commandRemoveChannelChannelRemoved", name) });
        }
}
