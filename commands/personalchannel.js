import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('personal-channel')
        .setDescription("Set a channel where infos about a single player are sent")
        .addSubcommand(subcommand =>
            subcommand
            .setName('set')
            .setDescription('Set a player to a channel')
            .addUserOption(option => option.setName('player').setDescription("The player you want to link").setRequired(true))
            .addChannelOption(option => option.setName('channel').setDescription("The channel where infos about the specified player will be sent").setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('unset')
            .setDescription('Remove a player from his current personal channel')
            .addUserOption(option => option.setName('player').setDescription("The player concerned").setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
            .setName('history')
            .setDescription('Show every player associated to a channel')
        ),


        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            let player;
            let user;
            let channel;

            const serverId = interaction.guildId;
            const server = await DB.getServer(serverId);
            const lang = server.language;

            const subCommand = interaction.options.getSubcommand();

            await interaction.deferReply({ ephemeral: true });
            
            // Récupérer le contexte de la commande
            switch (subCommand) {
                case 'set':
                    player = interaction.options.getUser('player');
                    channel = interaction.options.getChannel('channel');

                    // Vérifie que le channel est textuel
                    if (channel.type != "GUILD_TEXT") {
                        return interaction.editReply({ content: getLocale(lang, "commandChannelIsNotTextual", channel.toString())});
                    }

                    // Vérifie que le joueur existe
                    user = await DB.getUser(player.id);
                    if (user == null) {
                        return interaction.editReply({ content: getLocale(lang, "commandUserNotLinked", player)})
                    }

                    await DB.setPersonalChannel(interaction.guildId, user.discordId, channel.id)
                    return interaction.editReply({ content: getLocale(lang, "commandPersonnalChannelUserSetToChannel", player, channel.toString())})

                case 'unset':
                    player = interaction.options.getUser('player');

                    // Vérifie que le joueur existe
                    user = await DB.getUser(player.id);
                    if (user == null) {
                        return interaction.editReply({ content: getLocale(lang, "commandUserNotLinked", player)})
                    }

                    // Vérifie que le joueur est lié a un channel
                    const personalChannel = await DB.getPersonalChannel(serverId, user.discordId);
                    if (personalChannel == null) {
                        return interaction.editReply({ content: getLocale(lang, "commandPersonnalChannelUserNotSetToChannel", player)})
                    }

                    // Délier le joueur du channel
                    await DB.unsetPersonalChannel(serverId, user.discordId)

                    return interaction.editReply({ content: getLocale(lang, "commandPersonnalChannelUnsetChannel", player)})

                case 'history':
                    let description = "";

                    const server = await DB.getServer(serverId);
                    server.personalChannel.forEach(channel => {
                        description += `<@${channel.user}> -> <#${channel.channel}>\n`
                    })

                    if (description == "") {
                        return interaction.editReply({ content: getLocale(lang, "commandPersonnalChannelHistoryNoPersonnalChannels")})
                    }
                    const historyEmbed = new EmbedBuilder()
                        .setTitle(getLocale(lang, "commandPersonnalChannelHistoryEmbedTitle"))
                        .setDescription(description)
                    return interaction.editReply({ embeds: [historyEmbed]});
            }
        }

}
