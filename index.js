import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { commands } from './commands/index.js';
import { handleCommand } from './helpers/command.js';
import { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { main } from './score.js';
import { manageSessions } from './session.js';
import axios from 'axios';
import DB from './db.js';
import Chart from './chart.js';
import fr from './local/fr-FR.json' assert { type: "json" };
import en from './local/en-US.json' assert { type: "json" };


// ============================== index.js ===============================

// Préparation du bot
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);
export const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

for (const command of Object.values(commands)) {
    client.commands.set(command.data.name, command);
}

// Préparation des traductions
const strings = {
    fr: fr,
    en: en
}

// Lorsque le bot arrive sur un nouveau serveur
client.on('guildCreate', (server) => {
    registerCommands(server.id);
    DB.createServer(server.id);
})

// Lorsque le bot quitte un serveur
client.on('guildDelete', (server) => {
    DB.deleteServer(server.id);
})

// Lorsqu'un channel est delete
client.on('channelDelete', (channel) => {
    const channelId = channel.id;
    const serverId = channel.guildId;
    DB.findAndNullifyChannel(serverId, channelId);
})

// Lorsqu'un utilisateur quitte un serveur
client.on('guildMemberRemove', (member) => {
    const discordId = member.id;
    const serverId = member.guild.id;
    DB.removeServerFromUser(discordId, serverId);
})

// Fonction de lancement du bot
client.once('ready', function () {
    client.user.setActivity('Quaver', { type: 'PLAYING' });
     
    // Récuperer toutes les commandes crées
    registerCommands();

    setInterval(main, 30 * 1000);
    setInterval(manageSessions, parseInt(process.env.REFRESH_SESSION_RATE, 10) * 1000);
    setInterval(resetDailyCounter, 60 * 1000);
    console.log("started");
});
// ============================== Listeners ==============================

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        handleCommand(client, interaction);
    }

    // ===== Gestion de commande /search =====
    // SelectMenu

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select') {
            interaction.deferUpdate();
            const playerProfile = await buildPlayerProfile(interaction.guildId, interaction.values[0]);

            await interaction.followUp({ embeds: [playerProfile[0]], components: [playerProfile[1]] });
            await interaction.deleteReply();

        }
        if (interaction.customId === 'link') {
            interaction.deferUpdate();
            const username = interaction.message.components[0].components[0].options.find(user => { return user.value == interaction.values[0] }).label;
            const message = await linkAccount(interaction.guildId, interaction.user.id, username, interaction.user.username, interaction.values[0]);
            await interaction.editReply({ content: message, components: []});
        }
    }

    // Buttons
    if (interaction.isButton()) {
        // Si l'interaction avec le bouton correspond au 4k / 7k (bouton d'une autre cmd par exemple)
        if (interaction.customId.charAt(0) === '1' || interaction.customId.charAt(0) === '2') {
            interaction.deferUpdate();
            const playerProfile = await buildPlayerProfile(interaction.guildId, interaction.customId.substring(2, interaction.customId.length), interaction.customId.charAt(0));
            interaction.editReply({ embeds: [playerProfile[0]], components: [playerProfile[1]] })
        }
    }
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'edit-session') {
            await interaction.deferReply({ ephemeral: true });

            const server = await DB.getServer(interaction.guildId);
            const lang = server.language;
            const discordId = interaction.member.id;

            let fieldToUpdate = {}
            let idleTime = interaction.fields.getTextInputValue('idle-time');
            let imageUrl = interaction.fields.getTextInputValue('image-url');
            let difficultyLineColor = interaction.fields.getTextInputValue('difficulty-color');
            let accuracyLineColor = interaction.fields.getTextInputValue('accuracy-color');

            // Vérifier que le temps renseigné est valide
            if (idleTime != '' && (parseInt(idleTime) < 30 || parseInt(idleTime) > 180)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionIdleTimeOutOfRange") });
            }
            fieldToUpdate.sessionIdleTime = idleTime == '' ? 1800 : parseInt(idleTime) * 60;

            // Vérifier si l'image renseignée est valide
            if (imageUrl != '' && !/\.(jpg|jpeg|png|webp|svg)$/.test(imageUrl)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAnImage") });
            }
            fieldToUpdate.sessionImageUrl = imageUrl;

            // Vérifier si la couleur renseignée est valide
            if (difficultyLineColor != '' && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(difficultyLineColor)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAColor") });
            }
            fieldToUpdate.sessionDifficultyLineColor = difficultyLineColor;

            if (accuracyLineColor != '' && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(accuracyLineColor)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAColor") });
            }
            fieldToUpdate.sessionAccuracyLineColor = accuracyLineColor;

            // Sauvegarde des nouvelles infos
            await DB.setSessionInfo(discordId, fieldToUpdate);

            // Creation du Graph
            const user = await DB.getUser(discordId);

            const graphModes = [1, 1, 1, 2, 2, 2, 1, 2, 1, 2];
            const graphPr = [35.35, 27.3, 35.3, 23, 20.6, 26.7, 26.8, 28.9, 30.7, 33.8];
            const graphGrades = ['S', 'A', 'SS', 'A', 'B', 'S', 'SS', 'SS', 'SS', 'S'];
            const graphDiff = [34.9, 33.75, 32.3, 30.6, 37.3, 31.5, 25, 26.1, 28.7, 33.5];
            const graphAcc = [98.3, 94.6, 99.4, 93.4, 88.8, 95.3, 99.1, 99.7, 99.1, 98.2];
            const prefs = {}
            prefs.imageUrl = user.sessionImageUrl == '' ? null : user.sessionImageUrl;
            prefs.difficultyLineColor = user.sessionDifficultyLineColor == '' ? null : user.sessionDifficultyLineColor;
            prefs.accuracyLineColor = user.sessionAccuracyLineColor == '' ? null : user.sessionAccuracyLineColor;

            const sessionGraph = Chart.createSessionGraph(graphModes, graphPr, graphGrades, graphDiff, graphAcc, prefs);
            const graphUrl = await sessionGraph.getShortUrl();
            await interaction.editReply({ content: getLocale(lang, "commandEditSessionUpdated") });
            return await interaction.followUp({ content: graphUrl, ephemeral: true });
        }
    }
});

// ============================== Autres =================================

client.login(process.env.DISCORD_TOKEN);

// ============================== Fonctions ==============================

// Enregistre les nouvelles commandes dans le bot
function registerCommands(newGuildId = null) {
    const commandList = [];
    for (const command of commands) {
        commandList.push(command.data.toJSON());
    }

    (async function () {
        try {
            const clientId = process.env.CLIENT_ID;
            const server = await DB.getServers();
            if (newGuildId == null) {
                for (let i = 0; i < server.length; i++) {
                    let guildId = server[i].serverId;
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandList });
                }
                console.log(`Commands registered for ${server.length} servers`);
            } else {
                await rest.put(Routes.applicationGuildCommands(clientId, newGuildId), { body: commandList });
                console.log(`Commands registered for server ${newGuildId}`);
            }
        } catch (error) {
            console.error(error);
        }
    })();
}

// Effectuer une action sur tout les serveur et notifier
async function globalMessageAction(message) {
    // Action
    //await DB.resetDailyCounter();

    // Global server warning
    const embedWarning = new EmbedBuilder()
        .setColor("#EC9006")
        .setTitle(`Annonce de mise à jour`)
        .setDescription(message)
        .setTimestamp()

    const servers = await DB.getServers();
    for (let i = 0; i < servers.length; i++) {
        if (servers[i].scoreChannel != "") {

            // Envoie du message
            const channel = client.guilds.cache.get(servers[i].serverId).channels.cache.get(servers[i].scoreChannel);
            channel.send({ embeds: [embedWarning] });
        }
    }

}

// Reset les trackeur de rank journalier
async function resetDailyCounter() {
    const date = new Date();
    if (date.getUTCHours() == 22 && date.getUTCMinutes() == 0) {
        DB.resetDailyCounter();
    }
}

// Convert difficulty writing to stdr difficulty printing in Quaver
export function convertIntegerToString(number) {
    if (isNaN(number) || number == "0" || number == 0) { return "0"; }

    let difstr = number.toString();

    if (Number.isInteger(parseFloat(number))) {
        difstr += `.00`;
    }
    else {
        const difstr_dec = difstr.split('.')[1];
        if (difstr_dec.length < 2) {
            difstr += `0`;
        }
    }

    return difstr;
}

// Convert int to time format
export function convertIntegerToTime(number) {
    const sec_num = parseInt(number, 10);

    let hours = Math.floor(sec_num / 3600);
    let minutes = Math.floor((sec_num - (hours * 3600)) / 60);

    if (minutes < 10) { minutes = "0" + minutes; }

    if (hours > 0) {
        hours += "h";
    } else {
        hours = "";
        minutes = parseInt(minutes, 10) + " minutes";
    }
    return hours + minutes;
}

// Get Color from grade
export function getGradeColor(grade) {
    let color;
    switch (grade) {
        case 'A':
            color = '#359B4C';
            break;
        case 'B':
            color = '#29A4CC';
            break;
        case 'C':
            color = '#BC3D84';
            break;
        case 'D':
            color = '#F36262';
            break;
        case 'F':
            color = '#D52020';
            break;
        case 'S':
            color = '#FCFD80';
            break;
        case 'SS':
            color = '#F9F9BB';
            break;
        default:
            color = '#E8E8E8';
    }
    return color;
}

// Filter submittable scores
export function isScoreFiltered(filters, score) {
    let isScoreFiltered = false;
    filters.forEach(filtre => {
        switch (filtre) {
            case "pb":
                isScoreFiltered = !score.personal_best;
                break;
            case "nf":
                isScoreFiltered = score.grade == 'F';
                break;
            case "fc":
                isScoreFiltered = score.count_miss > 0;
                break;
        }
    })
    return isScoreFiltered;
}

// Parse filter names
export function parseFilter(filter) {
    let parsedFilter = "";
    switch (filter) {
        case "fc":
            parsedFilter = "FC Only";
            break;
        case "pb":
            parsedFilter = "Personal Best/map Only";
            break;
        case "nf":
            parsedFilter = "Hide Fail";
            break;
    }
    return parsedFilter;
}

// Get Color from rating
export function getRatingColor(rating) {
    if (rating < 1) return "#D1FFFA";
    if (rating < 2.5) return "#5EFF75";
    if (rating < 10) return "#5EC4FF";
    if (rating < 20) return "#F5B25B";
    if (rating < 30) return "#F9645D";
    if (rating < 40) return "#D761EB";
    if (rating < 50) return "#7B61EB";
    return "#B7B7B7";
}

// Essayer de lier un compte discord a un compte Quaver
export async function linkAccount(serverId, discordId, username, discordTag, quaverId) {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    let message = "";
    await axios.get('https://api.quavergame.com/v1/users/full/' + quaverId).then(async function (res) {
        const infos = res.data.user.info.information;
        const rank4k = res.data.user.keys4.globalRank;
        const rank7k = res.data.user.keys7.globalRank;

        /// Verifier que le compte est valide
        const discordTagFound = infos == null || infos.discord == '' ? null : infos.discord.split('#')[0].toLowerCase();

        // Si le profile n'est associé a aucun compte discord 
        if (discordTagFound == null) {
            message = `${getLocale(lang, "commandAccountNoDiscordFound", username)}\n*${getLocale(lang, "commandAccountTipsGetId")}*`
            return;
        }
        // Si le profile ne possède pas le meme nom que la personne qui execute la commande
        else if (discordTagFound != discordTagFound) {
            message = `${getLocale(lang, "commandAccountWrongId", username, discordTagFound, discordTag)}\n*${getLocale(lang, "commandAccountTipsGetId")}*`;
            return;
        }

        /// Le compte est valide
        // Liaison du compte discord -> quaver
        await DB.createUser(serverId, discordId, quaverId, rank4k, rank7k);

        message = getLocale(lang, "commandAccountLinked");
    })
    return message;
}

// Afficher le profile d'un joueur
export async function buildPlayerProfile(serverId, quaverId, defaultmode = '0') {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    let playerRes;
    let graph;

    // Récupération des informations pour construire le profile
    await axios.get('https://api.quavergame.com/v1/users/full/' + quaverId).then(async function (res) {
        playerRes = res;
    })

    const user = playerRes.data.user;
    const clan = user.clan;
    const info = user.info;
    let userStats;

    // Création des boutons
    const buttons = new ActionRowBuilder();
    const button4k = new ButtonBuilder()
        .setCustomId('1_' + quaverId)
        .setLabel('4K')
        .setStyle(ButtonStyle.Primary);
    const button7k = new ButtonBuilder()
        .setCustomId('2_' + quaverId)
        .setLabel('7K')
        .setStyle(ButtonStyle.Primary)

    switch (defaultmode) {
        case '0':
            if (info.information.default_mode != null) {
                defaultmode = info.information.default_mode;
            } else {
                defaultmode = '1';
            }
        // Pas de break !!!
        case '1':
            userStats = user.keys4;
            button4k.setDisabled(true);
            break;
        case '2':
            button7k.setDisabled(true);
            userStats = user.keys7;
            break;
    }
    buttons.addComponents(button4k, button7k);

    await axios.get('https://api.quavergame.com/v1/users/graph/rank?id=' + quaverId + '&mode=' + defaultmode).then(async function (res) {
        graph = res.data.statistics;
    })

    // Création du message

    // Création des différents fields du message
    const fields = [];
    const blank = { name: `\u200b`, value: `\u200b`, inline: true };

    // Affichage des classement
    const globalRank = userStats.globalRank;
    const country = info.country;
    const countryRank = userStats.countryRank;
    const multiplayerRank = userStats.multiplayerWinRank;
    fields.push({ name: getLocale(lang, 'embedPlayerProfileRank'), value: `Global: ${globalRank}\n:flag_${country.toLowerCase()}: : ${countryRank}\n Multi: ${multiplayerRank}`, inline: true });

    // Affichage de l'overall rating
    const overallRating = userStats.stats.overall_performance_rating;
    const avgRatingToGainOR = overallRating / 20;
    fields.push({ name: `Overall Rating`, value: `${convertIntegerToString(Math.round(overallRating * 100) / 100)}\n≃ ${convertIntegerToString(Math.round(avgRatingToGainOR * 100) / 100)} PR/Map`, inline: true });

    // Affichage de l'overall accuracy et du ratio
    const overallAccuracy = userStats.stats.overall_accuracy;
    const ratio = userStats.stats.total_marv / (userStats.stats.total_perf + userStats.stats.total_great + userStats.stats.total_good + userStats.stats.total_okay + userStats.stats.total_miss);
    fields.push({ name: `Overall Accuracy`, value: `${convertIntegerToString(Math.round(overallAccuracy * 100) / 100)}\nRatio: ${convertIntegerToString(Math.round(ratio * 100) / 100)}`, inline: true });

    // Affichage du clan
    fields.push(blank);
    fields.push({ name: `Clan`, value: `${clan == "null" ? clan : 'Not implemented yet'}`, inline: true })
    fields.push(blank);

    // Gestion des dates
    let dateactivityFormat;
    switch (lang) {
        case 'fr':
            dateactivityFormat = { year: 'numeric', month: 'long', weekday: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false };
            break;
        case 'en':
            dateactivityFormat = { year: 'numeric', month: 'long', weekday: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
    }
    const latestActivity = new Date(info.latest_activity).toLocaleDateString(lang, dateactivityFormat);
    const playSince = new Date(info.time_registered).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });

    const userInfo = new EmbedBuilder()
        .setColor('#E8E8E8')
        .setAuthor({ name: `${getLocale(lang, "embedPlayerProfileTitle", info.username)} - ${defaultmode == '1' ? '4' : '7'}K`, iconURL: null, url: `https://quavergame.com/user/${info.id}` }) // Info sur le joueur
        .setDescription("\u200b")
        .setThumbnail(info.avatar_url) // PfP
        .addFields(fields)
        .setFooter({ text: `${getLocale(lang, "embedPlayerProfileLastestActivity", latestActivity)}\n${getLocale(lang, "embedPlayerProfilePlaySince", playSince)}` })

    const rankGraph = Chart.createGraph(graph); // Création du graphique
    userInfo.setImage(await rankGraph.getShortUrl());

    return [userInfo, buttons];
}

// Construire un embed qui affiche les infos d'un utilisateur
export function buildUserInfos(lang, user) {
    let dateFormat;
    switch (lang) {
        case 'fr':
            dateFormat = new Date(user.latestMapPlayedTimestamp).toLocaleDateString(lang, { timeZone: 'Europe/Paris' });
        case 'en':
            dateFormat = new Date(user.latestMapPlayedTimestamp).toLocaleDateString(lang)
    }

    let description =
        `${getLocale(lang, "commandInfoDescriptionId")}: ${user.quaverId}\n` +
        `${getLocale(lang, "commandInfoDescriptionRank")} 4K: ${user.globalRank4k} (${(user.dailyRank4k > 0 ? "+ " : "")}${(user.dailyRank4 == null ? 0 : user.dailyRank4)} ${getLocale(lang, "embedScoreToday")})\n` +
        `${getLocale(lang, "commandInfoDescriptionRank")} 7K: ${user.globalRank7k} (${(user.dailyRank7k > 0 ? "+ " : "")}${(user.dailyRank7 == null ? 0 : user.dailyRank7)} ${getLocale(lang, "embedScoreToday")})\n` +
        `${getLocale(lang, "commandInfoDescriptionFilters")}: ${(user.filter.length == 0 ? ":x:" : user.filter.toString().replaceAll(',', ', '))}\n` +
        `${getLocale(lang, "commandInfoDescriptionLatestMapPlayed")}: ${dateFormat}\n` +
        `${getLocale(lang, "commandInfoDescriptionIdleTime", user.sessionIdleTime / 60)}`;

    const userInfo = new EmbedBuilder()
        .setColor('#E8E8E8')
        .setTitle(getLocale(lang, "commandInfoTitle"))
        .setDescription(description)

    return userInfo;
}

// Function to get locales and replace variables
export function getLocale(language, string, ...vars) {
    let locale = strings[language][string];

    let count = 0;
    locale = locale.replace(/%VAR%/g, () => {
        if (vars[count] !== null && typeof vars[count] !== 'undefined') {
            count++;
            return vars[count - 1];
        }
        else {
            return "%VAR%";
        }
    });

    return locale;
}

export default { getLocale, linkAccount, buildPlayerProfile, getGradeColor, getRatingColor, isScoreFiltered, parseFilter, convertIntegerToString, convertIntegerToTime, client };