import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-session-idle-timer')
        .setDescription("Set the time before a session ends due to inactivity")
        .addIntegerOption(option => option.setName('time').setDescription("Time (in minutes)").setRequired(true)),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;

            const discordId = interaction.member.id;
            const time = interaction.options.getInteger('time');

            await interaction.deferReply({ ephemeral: true });

            if (time < 30 || time > 180) {
                return interaction.editReply({ content: getLocale(lang, "commandSetSessionIdleTimeOutOfRange") });
            }

            // Vérifier que l'utilisateur est link
            const user = await DB.getUser(discordId);
            if (! user) {
                return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked") });
            }

            // Sauvegarde du nouveau temps
            await DB.setSessionIdleTime(discordId, time*60);
            
            return interaction.editReply({ content: getLocale(lang, "commandSetSessionIdleTimeUpdated", time) });
        }
}
