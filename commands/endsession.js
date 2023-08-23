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

        // Si le compte n'est pas lié
        if (! await DB.getUser(discordId)) {
            return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked")});
        }

        // Récupération de la session
        let session = await DB.getSession(discordId);

        // Si l'utilisateur n'as pas de session active
        if (session == null) {
            return interaction.editReply({ content: getLocale(lang, "commandEndSessionNoActiveSession")});
        }

        // On affiche uniquement le résumé pour les sessions ayant plus de 1 score
        if (session.scores.length <= 1) {
            return interaction.editReply({ content: getLocale(lang, "commandEndSessionNotEnoughMapsPlayed")});
        }

        // Affichage et suppression de la session dans tout les serveurs concernés
        const user = await DB.getUser(session.discordId);
        const servers = await DB.getServersList(user.server);

        for (let i = 0; i < servers.length; i++) {
            let currentServer = servers[i];
            let personalChannel = await DB.getPersonalChannel(currentServer.serverId, user.discordId);
            if (currentServer.sessionChannel != "") {

                // Envoie du message dans le channel global
                const globalChannel = interaction.client.guilds.cache.get(currentServer.serverId).channels.cache.get(currentServer.sessionChannel);
                await showSession(currentServer.language, globalChannel, session, null, commentaire);
            }
            if (personalChannel != null) {

                // Envoie du message dans le channel perso
                const channelPerso = interaction.client.guilds.cache.get(currentServer.serverId).channels.cache.get(personalChannel.channel);
                await showSession(currentServer.language, channelPerso, session, null, commentaire);
            }
        }
        DB.destroySession(session.discordId);

        return interaction.editReply({ content: getLocale(lang, "commandEndSessionSessionEnded", `<#${server.sessionChannel}>`) });
    }

}
