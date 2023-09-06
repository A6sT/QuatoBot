import { SlashCommandBuilder } from '@discordjs/builders';
import { StringSelectMenuBuilder, ActionRowBuilder, CommandInteraction } from 'discord.js';
import DB from '../db.js';
import axios from 'axios';
import { buildPlayerProfile, getLocale } from '../index.js';


export default {
    data: new SlashCommandBuilder()
        .setName('search-player')
        .setDescription('Look for players global statistics')
        .addStringOption(option => option.setName('username').setDescription("The player you want to look at").setRequired(true)),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const serverId = interaction.guildId;
            const server = await DB.getServer(serverId);
            const lang = server.language;
            const name = interaction.options.getString('username');

            // Récupérer tout les joueurs trouvés
            axios.get('https://api.quavergame.com/v1/users/search/' + name).then(async function (res) {
                const infos = res.data.users;

                if (infos.length > 1) {
                    await interaction.deferReply({ ephemeral: true });
                    let row = new ActionRowBuilder();
                    let menu = new StringSelectMenuBuilder()
                        .setCustomId('select')
                        .setPlaceholder(getLocale(lang, "commandSearchSelectPlaceholder"));

                    for (let i = 0; i < infos.length; i++) {
                        menu.addOptions({ label: infos[i].username, description: "Id: " + infos[i].id.toString(), value: infos[i].id.toString() });
                    }
                    row.addComponents(menu);

                    return await interaction.editReply({ content: getLocale(lang, "commandSearchSelectMessage"), components: [row]});
                }
                else if (infos.length == 1) {
                    await interaction.deferReply();
                    // Si il n'y a qu'un seul joueur, on envoie directement le résumé de ce joueur
                    const playerProfile = await buildPlayerProfile(serverId, infos[0].id)
                    return await interaction.editReply({ embeds: [playerProfile[0]], components: [playerProfile[1]] });
                }
                else {
                    return interaction.reply({ content: getLocale(lang, "commandSearchPlayerDoesNotExist"), ephemeral: true });
                }
            })
        }

}
