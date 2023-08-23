import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import axios from 'axios';
import DB from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('link-multiplayer-room')
        .setDescription("Lier une salle multijoueur au bot")
        .addStringOption(option => option.setName('room').setDescription("Le nom ou ID de la salle en multijoueur").setRequired(true))
        .addStringOption(option => option.setName('password').setDescription("Le mot de passe pour rejoindre la salle").setRequired(false)),
        /**
         * 
         * @param {CommandInteraction} interaction 
         */
        async execute(interaction) {
            const roomName = interaction.options.getString('room');
            const password = interaction.options.getString('password') ?? null;
            let roomInfo;

            // Verifie que la room existe
            await axios.get('https://api.quavergame.com/v1/multiplayer/games/').then(async function (r) {
                r.data.matches.live.forEach(room => {
                    if ((room.name == roomName || room.id == roomName) && room.id != -1) {
                        roomInfo = room;
                        return;
                    }
                })
            })
            if (roomInfo == null) {
                return interaction.reply({ content: `La salle ${roomName} n'a pas été trouvé / n'existe pas`, ephemeral: true });
            }

            // Si la salle existe déjà
            if (await DB.getMultiplayerRoom(roomInfo.id)) {
                return interaction.reply({ content: `Cette salle est déjà lié au bot !`, ephemeral: true });
            }
            // Enregistrer les infos sur la salle
            await DB.createMultiplayerRoom(roomInfo.id, password);

            const server = await DB.getServer(interaction.guildId);
            return interaction.reply({ content: `La salle ${roomName} a été lié au bot${server.multiplayerChannel != null ? `, vous pouvez suivre cette salle dans le channel <#${server.multiplayerChannel}>`: ''}`, ephemeral: true });
        }
}
