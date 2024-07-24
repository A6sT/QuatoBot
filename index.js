import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { commands } from './commands/index.js';
import { handleCommand } from './helpers/command.js';
import { Client, GatewayIntentBits, ActivityType, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { main } from './score.js';
import { manageSessions } from './session.js';
import axios from 'axios';
import DB from './db.js';
import Chart from './chart.js';
import fr from './local/fr-FR.json' assert { type: "json" };
import en from './local/en-US.json' assert { type: "json" };


// ============================== index.js ===============================
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);
export const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

for (const command of Object.values(commands)) {
    client.commands.set(command.data.name, command);
}

// Available translations
const strings = {
    fr: fr,
    en: en
}

// When the bot join a new server
client.on('guildCreate', (server) => {
    registerCommands(server.id);
    DB.createServer(server.id);
})

// When the bot leave a server
client.on('guildDelete', (server) => {
    DB.deleteServer(server.id);
})

client.on('channelDelete', (channel) => {
    const channelId = channel.id;
    const serverId = channel.guildId;
    DB.findAndNullifyChannel(serverId, channelId);
})

// When a user leave a server
client.on('guildMemberRemove', (member) => {
    const discordId = member.id;
    const serverId = member.guild.id;
    DB.removeServerFromUser(discordId, serverId);
})

// When the bot start
client.once('ready', function () {
    client.user.setPresence({
        activities: [{ name: `Quaver`, type: ActivityType.Playing }]
    });
    registerCommands();

    setInterval(main, 30 * 1000);
    setInterval(manageSessions, parseInt(process.env.REFRESH_SESSION_RATE) * 1000);
    console.log("started");
});
// ============================== Listeners ==============================

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        handleCommand(client, interaction);
    }

    // ===== Handle the /search command =====
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
        // Check if the interaction is with the 4k / 7k button
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
            let timezone = interaction.fields.getTextInputValue('timezone');
            let imageUrl = interaction.fields.getTextInputValue('image-url');
            let difficultyLineColor = interaction.fields.getTextInputValue('difficulty-color');
            let accuracyLineColor = interaction.fields.getTextInputValue('accuracy-color');

            // Check if time input is valid
            if (idleTime != '' && (parseInt(idleTime) < 30 || parseInt(idleTime) > 180)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionIdleTimeOutOfRange") });
            }
            fieldToUpdate.sessionIdleTime = idleTime == '' ? 1800 : parseInt(idleTime) * 60;

            // Check if timezone input is valid
            if (timezone != '' && (parseInt(timezone) < -12 || parseInt(timezone) > 14)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionTimezoneOutOfRange", timezone) });
            }
            fieldToUpdate.timezoneOffset = timezone == '' ? 0 : parseInt(timezone);

            // Check if image input is valid
            if (imageUrl != '' && !/\.(jpg|jpeg|png|webp|svg)$/.test(imageUrl)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAnImage") });
            }
            fieldToUpdate.sessionImageUrl = imageUrl;

            // Check if color input is valid
            if (difficultyLineColor != '' && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(difficultyLineColor)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAColor") });
            }
            fieldToUpdate.sessionDifficultyLineColor = difficultyLineColor;

            if (accuracyLineColor != '' && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(accuracyLineColor)) {
                return interaction.editReply({ content: getLocale(lang, "commandEditSessionNotAColor") });
            }
            fieldToUpdate.sessionAccuracyLineColor = accuracyLineColor;

            await DB.setSessionInfo(discordId, fieldToUpdate);

            // Creating an example graph
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

// ============================== Others =================================

client.login(process.env.DISCORD_TOKEN);

// ============================== Functions ==============================

// Register all commands for each server
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

// Sends a message to every server
async function globalMessageAction(title, message) {

    // Global server warning
    const embedWarning = new EmbedBuilder()
        .setColor("#EC9006")
        .setTitle(title)
        .setDescription(message)
        .setTimestamp()

    const servers = await DB.getServers();
    for (let i = 0; i < servers.length; i++) {
        if (servers[i].scoreChannel != "") {
            const server = client.guilds.cache.get(servers[i].serverId);
            const channel = server.channels.cache.get(servers[i].scoreChannel);
            if (channel.permissionsFor(server.members.me).toArray().includes("SendMessages")) {
                channel.send({ embeds: [embedWarning] });
            }
        }
    }

}

// Convert a number to Quaver difficulty format
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

// Get associated Quaver color grade from grade letter
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

// Filter score submitted to a discord channel
export function isScoreFiltered(filters, score) {
    let isScoreFiltered = false;
    for (let i = 0; i < filters.length && !isScoreFiltered; i++) {
        switch (filters[i]) {
            case "pb":
                isScoreFiltered = !score.personal_best;
                break;
            case "nf":
                isScoreFiltered = score.grade == 'F';
                break;
            case "fc":
                isScoreFiltered = score.count_miss > 0;
                break;
            case "hidescore":
                isScoreFiltered = true;
                break;
        }
    }

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
        case "hidescore":
            parsedFilter = "Hide Score";
            break;
        case "hidesession":
            parsedFilter = "Hide Session";
            break;
    }
    return parsedFilter;
}

// Get Quaver difficulty color from rating
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

// Try to link a Discord account to a Quaver account (from /link-account command)
export async function linkAccount(serverId, discordId, username, discordTag, quaverId) {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    let message = "";
    await axios.get('https://api.quavergame.com/v2/user/' + quaverId).then(async function (res) {
        const discordIdFound = res.data.user.discord_id;
        const rank4k = res.data.user.keys4.globalRank;
        const rank7k = res.data.user.keys7.globalRank;

        // Check if the Quaver profile has a discord account
        if (discordIdFound == null) {
            message = `${getLocale(lang, "commandAccountNoDiscordFound", username)}\n*${getLocale(lang, "commandAccountTipsGetId")}*`
            return;
        }
        // Check if that Discord account is the same as the user who executed the command
        else if (discordIdFound != discordId) {
            message = `${getLocale(lang, "commandAccountWrongId", username, discordTagFound, discordTag)}\n*${getLocale(lang, "commandAccountTipsGetId")}*`;
            return;
        }

        /// The account is valid 
        await DB.createUser(serverId, discordId, quaverId, rank4k, rank7k);

        message = getLocale(lang, "commandAccountLinked");
    })
    return message;
}

// Show a Quaver player profile (from /search-player command)
export async function buildPlayerProfile(serverId, quaverId, defaultmode = '0') {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    let playerRes;
    let graph;
    let clan;

    await axios.get('https://api.quavergame.com/v2/user/' + quaverId).then(async function (res) {
        playerRes = res;
    })

    const user = playerRes.data.user;

    if (user.clan_id != null) {
        await axios.get(`https://api.quavergame.com/v2/clan/${user.clan_id}`).then(async function (res) {
            clan = res.data.clan;
        })
    }
    
    let userStats;

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
            if (user.misc_information.default_mode != null) {
                defaultmode = user.misc_information.default_mode;
            } else {
                defaultmode = '1';
            }
        case '1':
            userStats = user.stats_keys4;
            button4k.setDisabled(true);
            break;
        case '2':
            button7k.setDisabled(true);
            userStats = user.stats_keys7;
            break;
    }
    buttons.addComponents(button4k, button7k);

    await axios.get(`https://api.quavergame.com/v2/user/${quaverId}/statistics/${defaultmode}/rank`).then(async function (res) {
        graph = res.data.ranks;
    })

    /// Creating the reply

    // Preparing each field
    const fields = [];
    const blank = { name: `\u200b`, value: `\u200b`, inline: true };

    // Ranking related fields
    const globalRank = userStats.ranks.global;
    const countryRank = userStats.ranks.country;
    const country = user.country;
    const hitRank = userStats.ranks.total_hits;
    fields.push({ name: getLocale(lang, 'embedPlayerProfileRank'), value: `Global: ${globalRank}\n:flag_${country.toLowerCase()}: : ${countryRank}\nHits: ${hitRank}`, inline: true });

    // Overall rating stuff
    const overallRating = userStats.overall_performance_rating;
    const avgRatingToGainOR = overallRating / 20;
    fields.push({ name: `Overall Rating`, value: `${convertIntegerToString(Math.round(overallRating * 100) / 100)}\n≃ ${convertIntegerToString(Math.round(avgRatingToGainOR * 100) / 100)} PR/Map`, inline: true });

    // Overall accuracy and ratio
    const overallAccuracy = userStats.overall_accuracy;
    const ratio = userStats.total_marvelous / userStats.total_perfect;
    fields.push({ name: `Overall Accuracy`, value: `${convertIntegerToString(Math.round(overallAccuracy * 100) / 100)}\nRatio: ${convertIntegerToString(Math.round(ratio * 100) / 100)}`, inline: true });

    // Clan stuff
    fields.push(blank);
    fields.push({ name: `Clan`, value: `${clan == null ? "None" : `[${clan.tag}] ${clan.name}`}`, inline: true })
    fields.push(blank);

    // Manage date formats
    let dateactivityFormat;
    switch (lang) {
        case 'fr':
            dateactivityFormat = { year: 'numeric', month: 'long', weekday: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false };
            break;
        case 'en':
            dateactivityFormat = { year: 'numeric', month: 'long', weekday: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
    }
    const latestActivity = new Date(user.latest_activity).toLocaleDateString(lang, dateactivityFormat);
    const playSince = new Date(user.time_registered).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });

    const userInfo = new EmbedBuilder()
        .setColor('#E8E8E8')
        .setAuthor({ name: `${getLocale(lang, "embedPlayerProfileTitle", user.username)} - ${defaultmode == '1' ? '4' : '7'}K`, iconURL: null, url: `https://quavergame.com/user/${user.id}` }) // Info sur le joueur
        .setDescription("\u200b")
        .setThumbnail(user.avatar_url) // PfP
        .addFields(fields)
        .setFooter({ text: `${getLocale(lang, "embedPlayerProfileLastestActivity", latestActivity)}\n${getLocale(lang, "embedPlayerProfilePlaySince", playSince)}` })

    const rankGraph = Chart.createGraph(graph); // Ranking graph (same as website)
    userInfo.setImage(await rankGraph.getShortUrl());

    return [userInfo, buttons];
}

// Create an embed that displays the user internal infos
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

// Function to get translations and replace variables
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