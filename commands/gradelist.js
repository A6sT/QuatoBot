import { SlashCommandBuilder } from '@discordjs/builders';
import { convertIntegerToString } from '../index.js';
import { EmbedBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import DB from '../db.js';
import { Pagination, getLocale } from 'pagination.djs';
import axios from 'axios';


export default {
    data: new SlashCommandBuilder()
        .setName('grade-list')
        .setDescription('Shows your list of score by grade ordered by descending accuracy')
        .addStringOption(option =>
            option.setName('grade')
                .setDescription('The grade of your scores')
                .setRequired(true)
                .addChoices(
                    { name: 'X', value: 'X' },
                    { name: 'S+', value: 'SS' },
                    { name: 'S', value: 'S' },
                    { name: 'A', value: 'A' },
                    { name: 'B', value: 'B' },
                    { name: 'C', value: 'C' },
                    { name: 'D', value: 'D' }
                )
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('4K or 7K ?')
                .setRequired(true)
                .addChoices(
                    { name: '4K', value: '1' },
                    { name: '7K', value: '2' }
                )
        ),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const user = await DB.getUser(interaction.member.id);
            let selectedGrade = interaction.options.getString("grade");
            let selectedMode = interaction.options.getString("mode");
            let scores = [];
            let isNextPageFound = true;

            // Si le compte n'est pas lié
            if (user == null) {
                return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked"), ephemeral: true });
            }

            await interaction.deferReply();

            for (let a = 0; isNextPageFound == true; a++) {
                
                await axios.get(`https://api.quavergame.com/v1/users/scores/grades?id=${user.quaverId}&mode=${selectedMode}&grade=${selectedGrade}&page=${a}`).then(async function (res) {
                    if (res.data.scores.length == 0) {
                        isNextPageFound = false;
                        return;
                    }
                    res.data.scores.forEach(score => {
                        scores.push(score);
                    })
                })
            }
            /*let ideal;
            switch (selectedGrade) {
                case 'S':
                    ideal = 99;
                    break;
                case 'A':
                    ideal = 95;
                    break;
                case 'B':
                    ideal = 90;
                    break;
                case 'C':
                    ideal = 80;
                    break;
                case 'D':
                    ideal = 70;
                    break;
                default:
                    ideal = 100;
            }
            ideal += 0.01;*/

            scores.sort((a, b) => {
                /*const aWeight = 1 - Math.sqrt(Math.pow(a.accuracy - ideal, 2) + Math.pow(parseInt(new Date().getTime() - Date.parse(a.time)), 2))
                const bWeight = 1 - Math.sqrt(Math.pow(b.accuracy - ideal, 2) + Math.pow(parseInt(new Date().getTime() - Date.parse(b.time)), 2))
                return bWeight - aWeight;*/
                return b.accuracy - a.accuracy;
            })
            if (scores.length == 0) {
                return await interaction.editReply({ content: "No scores has been found for this grade !", ephemeral: true });
            }
            
            // Build the array of embeds
            let arrayEmbeds = []
            let currentDesc = "";
            for (let i = 0; i < scores.length; i++) {
                const score = scores[i];
                const map = score.map;
                const performance_rating = convertIntegerToString(Math.round(score.performance_rating * 100) / 100);
                const accuracy = convertIntegerToString(Math.round(score.accuracy * 100) / 100);
                currentDesc += `${i + 1}. <t:${parseInt(Date.parse(score.time) / 1000)}:R> [${map.title} - [${map.difficulty_name}]](https://quavergame.com/mapset/map/${map.id}) ${accuracy}%${score.mods_string == "None" ? "" : ` (${score.mods_string})`} - ${performance_rating} PR\n`;

                // Build the embed once 15 scores are built
                if ((i+1) % 10 == 0 || i + 1 == scores.length) {
                    const embed = new EmbedBuilder()
                        .setColor('#29A4CC') // Couleur en rapport avec la note
                        .setTitle(`(Supposed) Next easiest maps to get a better grade on`) // Nom de la map et difficulté
                        .setDescription(currentDesc)
                        .setThumbnail(`https://static.quavergame.com/img/grades/${selectedGrade}.png`) // Grade
                        .setTimestamp()

                    arrayEmbeds.push(embed);
                    currentDesc = "";
                }
            }

            // Send the paginate result (by 10 if needed)
            if (arrayEmbeds.length > 1) {
                const pagination = new Pagination(interaction);
                pagination.setEmbeds(arrayEmbeds);
                pagination.setEmbeds(arrayEmbeds, (embed, index, array) => {
                    return embed.setFooter({ text: `Page: ${index + 1} / ${array.length} | ${scores.length} scores` });
                });
                pagination.render();
            } else {
                await interaction.editReply({ embeds: arrayEmbeds });
            }
        }
}
