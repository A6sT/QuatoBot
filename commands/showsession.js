import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import DB from '../db.js';
import { getLocale } from '../index.js';
import { showSession } from '../session.js';

export default {
    data: new SlashCommandBuilder()
        .setName('show-session')
        .setDescription('Shows your current session'),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const discordId = interaction.member.id;
            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;

            // Si le compte n'est pas lié
            if (! await DB.getUser(discordId)) {
                return interaction.reply({ content: getLocale(lang, "commandAccountNotLinked"), ephemeral: true });
            }

            // Récupération de la session
            let session = await DB.getSession(discordId);

            // Si l'utilisateur n'as pas de session active
            if (session == null) {
                return interaction.reply({ content: getLocale(lang, "commandSessionNoSession"), ephemeral: true });
            }

            // Si la session a moins de 2 scores, on ne l'affiche pas
            if (session.scores.length < 2) {
                return interaction.reply({ content: getLocale(lang, "commandSessionNotEnoughScores"), ephemeral: true });
            }

            // Afficher la session en cours de l'utilisateur
            await interaction.deferReply();
            return await showSession(lang, null, session, interaction);
        }

}
