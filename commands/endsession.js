import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import DB from '../db.js';
import { getLocale } from '../index.js';
import { showSession } from '../session.js';

export default {
    data: new SlashCommandBuilder()
        .setName('end-session')
        .setDescription('End your active session')
        .addStringOption(option => option.setName('comment').setDescription('[Optional] A comment regarding your session')
            .setRequired(false)),
    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const discordId = interaction.member.id;
        const serverId = interaction.guildId;
        const server = await DB.getServer(serverId);
        const lang = server.language;
        const commentaire = interaction.options.getString('comment');

        await interaction.deferReply({ ephemeral: true });

       // Check if the user is linked to the bot
        if (! await DB.getUser(discordId)) {
            return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked")});
        }

        // Get the current user's session
        let session = await DB.getSession(discordId);
        if (session == null) {
            return interaction.editReply({ content: getLocale(lang, "commandEndSessionNoActiveSession")});
        }

        // Only display the session if it has at least 6 scores
        if (session.scores.length <= 5) {
            return interaction.editReply({ content: getLocale(lang, "commandEndSessionNotEnoughMapsPlayed")});
        }

        // Display the session to every channels it can be displayed
        const user = await DB.getUser(session.discordId);
        const servers = await DB.getServersList(user.server);

        for (let i = 0; i < servers.length; i++) {
            let currentServer = servers[i];
            let personalChannel = await DB.getPersonalChannel(currentServer.serverId, user.discordId);

            const serverCache = interaction.client.guilds.cache.get(currentServer.serverId);
            if (currentServer.sessionChannel != "" && !user.filter.includes("hidesession")) {

                // Send message in global channel
                const globalChannel = serverCache.channels.cache.get(currentServer.sessionChannel);
                if (globalChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                    await showSession(currentServer.language, globalChannel, session, null, commentaire);
                }
            }
            if (personalChannel != null && !personalChannel.filter.includes("hidesession")) {

                // Send message in personal channel
                const channelPerso = serverCache.channels.cache.get(personalChannel.channel);
                if (channelPerso.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                    await showSession(currentServer.language, channelPerso, session, null, commentaire);
                }
            }
        }
        DB.destroySession(session.discordId);

        return interaction.editReply({ content: getLocale(lang, "commandEndSessionSessionEnded", `<#${server.sessionChannel}>`) });
    }
}
