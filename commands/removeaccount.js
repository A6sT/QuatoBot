import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import { getLocale } from '../index.js';
import DB from '../db.js';


export default {
    data: new SlashCommandBuilder()
        .setName('unlink-account')
        .setDescription('Unlink your Quaver account from this server'),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const serverId = interaction.guildId;
            const server = await DB.getServer(serverId);
            const lang = server.language;

            const discordId = interaction.member.id;
            const user = await DB.getUser(discordId);

            await interaction.deferReply({ ephemeral: true });

            // Check if the account is linked
            if(user == null){
                return interaction.editReply({ content: getLocale(lang, "commandAccountNotLinked")});
            }

            // Check if it is linked on the server the command is used on
            if (! user.server.includes(serverId)) {
                return interaction.editReply({ content: getLocale(lang, "commandRemoveAccountNotLinked")});
            }
            
            await DB.removeServerFromUser(discordId, serverId);
            return interaction.editReply({ content: getLocale(lang, "commandRemoveAccountUnlinked")});
        }

}
