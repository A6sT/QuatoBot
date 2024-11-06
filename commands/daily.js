import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { getLocale } from '../index.js';
import { makeDailyLeaderboard, makeDailyEmbed } from '../dailychallenge.js';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('daily-challenge')
        .setDescription('Display informations about the daily challenge')
        .addSubcommand(subcommand =>
            subcommand
                .setName("map")
                .setDescription("Show the map to play for today's challenge")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription("Show the leaderboard for today's challenge")
        ),


    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        let discordId = interaction.member.id;
        const serverId = interaction.guildId;
        const server = await DB.getServer(serverId);
        const lang = server.language;
        
        const command = interaction.options.getSubcommand();

        await interaction.deferReply({ ephemeral: true });

        // Check if the user is linked to the bot
        const user = await DB.getUser(discordId);
        if (user == null) {
            return interaction.editReply({ content: getLocale(lang, "commandAccountUserNotLinked", `<@${discordId}>`) })
        }

        switch (command) {
            case "map":
                const embed = await makeDailyEmbed(interaction);
                return interaction.editReply({ embeds: [embed] });

            case "leaderboard":
                makeDailyLeaderboard(interaction);
                return;
        }

        return interaction.editReply({ content: "this shouldn't be displayed" });
    }
}