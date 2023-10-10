import { SlashCommandBuilder } from '@discordjs/builders';
import { getLocale } from '../index.js';
import { CommandInteraction, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('edit-session')
        .setDescription("Edit your session parameters"),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;
            const discordId = interaction.member.id;

            // Vérifier que l'utilisateur est link
            const user = await DB.getUser(discordId);
            if (! user) {
                return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked"), ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('edit-session')
                .setTitle('Session settings (clear for default value)');

            const idleTimeInput = new TextInputBuilder()
                .setCustomId('idle-time')
                .setLabel("Time before session ends due to inactivity")
                .setPlaceholder("Time must be between 30 and 180 (minutes)")
                .setStyle(TextInputStyle.Short)
                .setValue(user.sessionIdleTime == null ? '' : (user.sessionIdleTime/60).toString())
                .setRequired(false);

            const timezoneInput = new TextInputBuilder()
                .setCustomId('timezone')
                .setMaxLength(3)
                .setLabel("Set your current timezone (UTC+x)")
                .setPlaceholder("Offset must be between -12 and 14. Ex: New York is -5")
                .setStyle(TextInputStyle.Short)
                .setValue(user.timezoneOffset == 0 || user.timezoneOffset == null ? '' : user.timezoneOffset.toString())
                .setRequired(false);


            const imageUrlInput = new TextInputBuilder()
                .setCustomId('image-url')
                .setLabel("Set image of background for graph")
                .setPlaceholder("Url from the hosted image (must be .jpg, .jpeg, .png, .webp or .svg)")
                .setStyle(TextInputStyle.Short)
                .setValue(user.sessionImageUrl == null ? '' : user.sessionImageUrl)
                .setRequired(false);

            const difficultyLineColorInput = new TextInputBuilder()
                .setCustomId('difficulty-color')
                .setLabel("Set color of difficulty line on graph")
                .setPlaceholder("must be at hex format (default is #e9b736)")
                .setStyle(TextInputStyle.Short)
                .setValue(user.sessionDifficultyLineColor == null ? '' : user.sessionDifficultyLineColor)
                .setRequired(false);

            const accuracyLineColorInput = new TextInputBuilder()
                .setCustomId('accuracy-color')
                .setLabel("Set color of accuracy line on graph")
                .setPlaceholder("must be at hex format (default is #d3d3d3)")
                .setStyle(TextInputStyle.Short)
                .setValue(user.sessionAccuracyLineColor == null ? '' : user.sessionAccuracyLineColor)
                .setRequired(false);

            const row1 = new ActionRowBuilder().addComponents(idleTimeInput);
            const row2 = new ActionRowBuilder().addComponents(timezoneInput);
            const row3 = new ActionRowBuilder().addComponents(imageUrlInput);
            const row4 = new ActionRowBuilder().addComponents(difficultyLineColorInput);
            const row5 = new ActionRowBuilder().addComponents(accuracyLineColorInput);
            modal.addComponents(row1, row2, row3, row4, row5);

            return await interaction.showModal(modal);
        }
}