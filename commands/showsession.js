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

            // Check if account is linked
            if (! await DB.getUser(discordId)) {
                return interaction.reply({ content: getLocale(lang, "commandAccountNotLinked"), ephemeral: true });
            }

            // Get current user session
            let session = await DB.getSession(discordId);
            if (session == null) {
                return interaction.reply({ content: getLocale(lang, "commandSessionNoSession"), ephemeral: true });
            }

            // Only display the session if it has more than 2 scores
            if (session.scores.length < 2) {
                return interaction.reply({ content: getLocale(lang, "commandSessionNotEnoughScores"), ephemeral: true });
            }

            await interaction.deferReply();
            return await showSession(lang, null, session, interaction);
        }

}
