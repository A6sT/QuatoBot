import { SlashCommandBuilder } from '@discordjs/builders';
import { StringSelectMenuBuilder, ActionRowBuilder, CommandInteraction } from 'discord.js';
import { getLocale, linkAccount } from '../index.js';
import axios from 'axios';
import DB from '../db.js';


export default {
    data: new SlashCommandBuilder()
        .setName('link-account')
        .setDescription('Lier son compte Quaver a son compte discord')
        .addStringOption(option => option.setName('username').setDescription("Your Quaver IGN (Only needed the first time you link yourself to the bot)")),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const accountId = interaction.member.id;
            const serverId = interaction.guildId;
            const server = await DB.getServer(serverId);
            const lang = server.language;

            // Si le compte est déja lié
            let user = await DB.getUser(accountId);

            if (user != null) {
                if (user.server.includes(serverId)) {
                    return interaction.reply({ content: getLocale(lang, "commandAccountAlreadyLinkedToServer"), ephemeral: true});
                }

                await DB.addServerToUser(user.discordId, serverId);
                return interaction.reply({ content: getLocale(lang, "commandAccountLinkedToServer"), ephemeral: true });
            }

            /// Tenter de lier l'utilisateur au bot

            // Chercher le compte associé au nom d'utilisateur renseigné
            const name = interaction.options.getString('username');

            // Récupérer tout les joueurs trouvés
            axios.get('https://api.quavergame.com/v1/users/search/' + name).then(async function (res) {
                const infos = res.data.users;

                if (infos.length > 1) {
                    let row = new ActionRowBuilder();
                    let menu = new StringSelectMenuBuilder()
                        .setCustomId('link')
                        .setPlaceholder(getLocale(lang, "commandSearchSelectPlaceholder"));

                    for (let i = 0; i < infos.length; i++) {
                        menu.addOptions({ label: infos[i].username, description: "Id: " + infos[i].id.toString(), value: infos[i].id.toString() });
                    }
                    row.addComponents(menu);

                    return await interaction.reply({ content: getLocale(lang, "commandSearchSelectMessage"), components: [row], ephemeral: true });
                }
                else if (infos.length == 1) {
                    // Si il n'y a qu'un seul joueur, on tente directement de lier ce joueur
                    const message = await linkAccount(serverId, accountId, name, interaction.user.username, infos[0].id);
                    return interaction.reply({ content: message, ephemeral: true });
                }
                else {
                    return interaction.reply({ content: getLocale(lang, "commandSearchPlayerDoesNotExist"), ephemeral: true });
                }
            })
        }

}
