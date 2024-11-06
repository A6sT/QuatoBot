import DB from './db.js';
import { Pagination } from 'pagination.djs';
import { EmbedBuilder, ButtonStyle } from 'discord.js';
import { getLocale, getRatingColor, convertIntegerToString, client } from './index.js';
import axios from 'axios';

// Manage daily challenges
export async function dailyChallenge() {

    // Change the daily challenge
    const date = new Date();
    if (!(date.getUTCHours() % 24 == 0 && date.getUTCMinutes() == 0)) { return; }

    // Announce yesterday's winner
    await announceWinner();

    let mapsetId, map;
    let isInvalid = true;
    // Get a random ranked map
    while (isInvalid) {
        await axios.get(`https://api.quavergame.com/v2/mapset/ranked`).then(async function (res) {
            const rankedMapsets = res.data.ranked_mapsets;
            const rnd = Math.floor(Math.random() * rankedMapsets.length);
            mapsetId = rankedMapsets[rnd];
        });

        await axios.get(`https://api.quavergame.com/v2/mapset/${mapsetId}`).then(async function (res) {
            const maps = res.data.mapset.maps;
            const rnd = Math.floor(Math.random() * maps.length);
            map = maps[rnd];
        });

        if (map.game_mode == 1) { isInvalid = false; }
    }

    await DB.setDailyChallenge(map);
    console.log("new daily map !");

    const servers = await DB.getServers();
    for (let i = 0; i < servers.length; i++) {
        let server = servers[i];

        // Send message to announcment channels
        const serverCache = client.guilds.cache.get(server.serverId);
        if (server.challengeChannel != null && server.challengeChannel != "") {
            const challengeChannel = serverCache.channels.cache.get(server.challengeChannel);
            if (challengeChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                await challengeChannel.send({ embeds: [await createDailyEmbed(server.serverId)] });
            }
        }
    }
}

export async function makeDailyLeaderboard(interaction, isSilent = true) {
    const serverId = interaction.guildId;
    const server = await DB.getServer(serverId);
    const lang = server.language;

    const dailyChallenge = await DB.getDailyChallenge();
    const map = dailyChallenge.map;
    const scores = dailyChallenge.scores;

    const pagination = new Pagination(interaction, {
        firstEmoji: '⏮',
        prevEmoji: '◀️',
        nextEmoji: '▶️',
        lastEmoji: '⏭',
        limit: 10,
        idle: 30000,
        ephemeral: isSilent,
        prevDescription: `### ${getLocale(lang, "dailyChallengeToday")}\n` +
            `[${map.title}](https://quavergame.com/mapset/map/${dailyChallenge.mapId}) - ${map.difficulty_name} (${convertIntegerToString(Math.round(map.difficulty_rating * 100) / 100)}), ` +
            `${getLocale(lang, "embedScoreCreatedBy", map.creator_username)}\n` +
            `## ${getLocale(lang, "dailyChallengeLeaderboard")}\n` +
            "Format: ``Ranking``. ``Player`` - ``Performance Rating``, ``Accuracy`` (``Mods used``)\n",
        postDescription: `\n${getLocale(lang, "dailyChallengeEndTime", `<t:${dailyChallenge.endTime}:R>`)}`,
        buttonStyle: ButtonStyle.Secondary,
        loop: false

    });

    pagination.setTitle(`${getLocale(lang, "dailyChallengeLeaderboardTitle")}`);
    pagination.setColor("#FFB43C")

    const descriptions = [];
    scores.sort((a, b) => b.performance_rating - a.performance_rating);
    let i = 1;
    scores.forEach(score => {
        const player = (score.clan == null ? '' : `[${score.clan.tag}] `) + score.quaverName;
        const performanceRating = convertIntegerToString(Math.round(score.performance_rating * 100) / 100);
        const accuracy = convertIntegerToString(Math.round(score.accuracy * 100) / 100);
        const underline = score.discordId == interaction.member.id ? "__" : "";
        descriptions.push(`${underline}**${i}**. ${player} - ${performanceRating}, ${accuracy}% (${score.mods})${underline}`);
        i++
    })
    if (descriptions.length == 0) {
        descriptions.push(`${getLocale(lang, "dailyChallengeLeaderboardNoScores")}`)
    }
    pagination.setDescriptions(descriptions);
    pagination.render();
}

export async function makeDailyEmbed(interaction) {
    const serverId = interaction.guildId;
    return await createDailyEmbed(serverId);
}

async function createDailyEmbed(serverId) {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    const challenge = await DB.getDailyChallenge();
    const map = challenge.map;

    const difficulty_rating = convertIntegerToString(Math.round(map.difficulty_rating * 100) / 100);
    const color = getRatingColor(difficulty_rating);

    let titleMapInfo = `${map.artist} - ${map.title} - [${map.difficulty_name}]`;
    if (titleMapInfo.length > 230) {
        titleMapInfo = `${titleMapInfo.substring(0, 230)}...`;
    }

    const embedMap = new EmbedBuilder()
        .setColor(color)
        .setTitle(`[${challenge.map.game_mode == 1 ? '4' : '7'}K] ${titleMapInfo} (${difficulty_rating})`)
        .setURL(`https://quavergame.com/mapset/map/${challenge.mapId}`)
        .setAuthor({ name: `${getLocale(lang, "dailyChallengeNewMap")}` })
        .setDescription(`${getLocale(lang, "embedScoreCreatedBy", map.creator_username)}\n\n${getLocale(lang, "dailyChallengeGoal")}\n\n${getLocale(lang, "dailyChallengeEndTime", `<t:${challenge.endTime}:R>`)}`)
        .setImage(`https://cdn.quavergame.com/mapsets/${map.mapset_id}.jpg`)

    return embedMap;
}

async function announceWinner() {
    const servers = await DB.getServers();
    for (let i = 0; i < servers.length; i++) {
        let server = servers[i];

        // Send message to challenge channels
        const serverCache = client.guilds.cache.get(server.serverId);
        if (server.challengeChannel != null && server.challengeChannel != "") {
            const challengeChannel = serverCache.channels.cache.get(server.challengeChannel);
            if (challengeChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                await challengeChannel.send({ embeds: [await createWinnerEmbed(server.serverId)] });
            }
        }
    }
}
async function createWinnerEmbed(serverId) {
    const server = await DB.getServer(serverId);
    const lang = server.language;

    const oldChallenge = await DB.getDailyChallenge();
    const map = oldChallenge.map;
    const scores = oldChallenge.scores;
    scores.sort((a, b) => b.performance_rating - a.performance_rating);

    const difficulty_rating = convertIntegerToString(Math.round(map.difficulty_rating * 100) / 100);
    const color = getRatingColor(difficulty_rating);
    let titleMapInfo = `${map.artist} - ${map.title} - [${map.difficulty_name}]`;

    let description = `## ${getLocale(lang, "dailyChallengeYesterday")}\n` +
        `[${titleMapInfo}](https://quavergame.com/mapset/map/${oldChallenge.mapId}) (${difficulty_rating})\n` +
        `## ${getLocale(lang, "dailyChallengeResults")}\n`;

    let winnerScore = null;
    if (scores.length > 0) {
        winnerScore = oldChallenge.scores[0];
        const winner = (winnerScore.clan == null ? '' : `[${winnerScore.clan.tag}] `) + winnerScore.quaverName;
        description += `${getLocale(lang, "dailyChallengeAnnounceWinner", winner)}\n` +
            `### Top 3\n`;
        for (let i = 0; oldChallenge.scores[i] != null && i < 3; i++) {
            let scoreRes = oldChallenge.scores[i];
            let modsUsed = scoreRes.mods == 'None' ? '' : `(${scoreRes.mods})`;
            let player = (scoreRes.clan == null ? '' : `[${scoreRes.clan.tag}] `) + scoreRes.quaverName;
            let performanceRating = convertIntegerToString(Math.round(scoreRes.performance_rating * 100) / 100);
            let accuracy = convertIntegerToString(Math.round(scoreRes.accuracy * 100) / 100);

            description += `**${i + 1}**. ${player} - ${performanceRating}, ${accuracy}% ${modsUsed}\n`;
        }
    } else {
        description += `${getLocale(lang, "dailyChallengeNoWinner")}`;
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${getLocale(lang, "dailyChallengeResultTitle")}` })
        .setDescription(description)

    if (winnerScore != null) {
        embed.setThumbnail(winnerScore.quaverIcon)
    }

    return embed;
}

export default { dailyChallenge };