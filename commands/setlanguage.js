import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-language')
        .setDescription("Set the bot language")
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Pick a language')
                .setRequired(true)
                .addChoices(
                    { name: 'English', value: 'en' },
                    { name: 'Français', value: 'fr' }
                )),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;

            const selectedLanguage = interaction.options.getString("language");

            await interaction.deferReply({ ephemeral: true });
            // Sauvegarde de la nouvelle langue
            await DB.setLanguage(interaction.guildId, selectedLanguage);
            
            return interaction.editReply({ content: getLocale(selectedLanguage, "commandSetLanguageLangDefined"), ephemeral: true });
        }
}
