import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-session-image')
        .setDescription("Set the image of the background for the session graph")
        .addIntegerOption(option => option.setName('url').setDescription("URL to the image to show (leave empty to remove current image)").setRequired(false)),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;

            const discordId = interaction.member.id;
            const url = interaction.options.getInteger('url');

            await interaction.deferReply({ ephemeral: true });

            // Vérifier que l'utilisateur est link
            const user = await DB.getUser(discordId);
            if (! user) {
                return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked") });
            }

            // Vérifier si l'image renseignée est valide
            if (url != null && !/\.(jpg|jpeg|png|webp|svg)$/.test(url)) {
                return interaction.editReply({ content: getLocale(lang, "commandSetSessionImageNotAnImage") });
            }


            // Sauvegarde du nouveau temps
            await DB.setSessionImage(discordId, url == null ? '' : url);
            
            return interaction.editReply({ content: getLocale(lang, "commandSetSessionImageUpdated", time) });
        }
}
