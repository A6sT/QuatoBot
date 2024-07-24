import DB from './db.js';
import axios from 'axios';
import Chart from './chart.js';
import { EmbedBuilder } from 'discord.js';
import { getLocale, getRatingColor, convertIntegerToTime, convertIntegerToString, client } from './index.js';

// Manage the game sessions
export async function manageSessions() {

    // Update all actives sessions
    await DB.updateActiveSession();

    // Send infos about all inactive sessions, and delete them
    const expiredSessions = await DB.getExpiredSessions();
    expiredSessions.forEach(async (session) => {

        // Only the sessions that have at least 5 scores are displayed
        if (session.scores.length >= 5) {
            const user = await DB.getUser(session.discordId);
            const servers = await DB.getServersList(user == null ? null : user.server);

            for (let i = 0; i < servers.length; i++) {
                let server = servers[i];
                let personalChannel = await DB.getPersonalChannel(server.serverId, user.discordId);

                const serverCache = client.guilds.cache.get(server.serverId);
                if (server.sessionChannel != "" && !user.filter.includes("hidesession")) {

                    // Send recap in global channel
                    const globalChannel = serverCache.channels.cache.get(server.sessionChannel);
                    if (globalChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                        await showSession(server.language, globalChannel, session);
                    }
                }
                if (personalChannel != null && !personalChannel.filter.includes("hidesession")) {

                    // Send recap in personal channel
                    const channelPerso = serverCache.channels.cache.get(personalChannel.channel);
                    if (channelPerso.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                        await showSession(server.language, channelPerso, session);
                    }
                }
            }
        }
        DB.destroySession(session.discordId);
    })
}

// Display the game session of a user (finished or not)
export async function showSession(lang, channel, session, interaction = null, comment = null) {
    const user = await DB.getUser(session.discordId);
    let player;

    await axios.get('https://api.quavergame.com/v2/user/' + user.quaverId).then((res) => {
        player = res.data.user;
    })

    let performanceRating, difficulty, accuracy, accuracryWithFail, maxCombo, ratio, pbAmount, fcAmount, mapPlayed, mapFailed, graphModes, graphPr, graphGrades, graphDiff, graphAcc;
    performanceRating = difficulty = accuracy = accuracryWithFail = maxCombo = ratio = pbAmount = fcAmount = mapPlayed = mapFailed = 0;
    graphModes = [];
    graphPr = [];
    graphGrades = [];
    graphDiff = [];
    graphAcc = [];

    session.scores.forEach((score) => {
        let currentDiff = 0;
        mapPlayed++;

        if (score.grade == 'F') {
            mapFailed++;
        } else {
            currentDiff = Math.round((score.performance_rating / Math.pow(score.accuracy / 98, 6)) * 100) / 100;
            performanceRating += score.performance_rating;
            difficulty += currentDiff
            accuracy += score.accuracy;
        }

        accuracryWithFail += score.accuracy;
        ratio += score.ratio;

        if (score.max_combo > maxCombo) {
            maxCombo = score.max_combo;
        }
        if (score.is_personal_best) {
            pbAmount++;
        }
        if (score.count_miss == 0) {
            fcAmount++;
        }

        // Graph infos
        graphModes.push(score.mode);
        graphPr.push(score.performance_rating);
        graphGrades.push(score.grade);
        graphAcc.push(score.accuracy);
        graphDiff.push(currentDiff);
    })
    const mapFinished = mapPlayed - mapFailed;

    accuracryWithFail = convertIntegerToString(Math.round((accuracryWithFail / mapPlayed) * 100) / 100) + '%';
    ratio = convertIntegerToString(Math.round((ratio / mapPlayed) * 100) / 100);

    if (mapFinished > 0) {
        // Accuracy
        accuracy = convertIntegerToString(Math.round((accuracy / mapFinished) * 100) / 100) + '%';
        if (mapFailed > 0) {
            accuracy += `\n ${getLocale(lang, "embedSessionAccuracyWithFail", accuracryWithFail)}`;
        }
        // Performance Rating
        performanceRating = convertIntegerToString(Math.round((performanceRating / mapFinished) * 100) / 100);

        // Difficulty
        difficulty = convertIntegerToString(Math.round((difficulty / mapFinished) * 100) / 100);
    } else {
        accuracy = accuracryWithFail;
        performanceRating = "0.00";
        difficulty = "0.00";
    }

    // Preparing fields for the embed
    if (comment == null) {
        comment = getLocale(lang, "embedSessionDefaultCommentary", `<@${user.discordId}>`);
    }
    const fields = [];
    const blank = { name: `\u200b`, value: `\u200b`, inline: true };

    // Accuracy
    fields.push({ name: 'Accuracy', value: accuracy, inline: true });
    // Ratio
    fields.push({ name: 'Ratio', value: ratio, inline: true });
    // Max Combo
    fields.push({ name: 'Max Combo', value: maxCombo.toString(), inline: true })
    // Performance Rating
    fields.push({ name: 'Performance Rating', value: performanceRating, inline: true });
    // Difficulty
    fields.push({ name: getLocale(lang, "embedSessionMapDifficulty"), value: difficulty, inline: true });
    // ?
    fields.push(blank);
    // PB
    fields.push({ name: getLocale(lang, "embedSessionPBs"), value: pbAmount.toString(), inline: true });
    // FC
    fields.push({ name: getLocale(lang, "embedSessionFCs"), value: fcAmount.toString(), inline: true })
    // ?
    fields.push(blank);
    // Maps played
    fields.push({ name: getLocale(lang, "embedSessionMapPlayed"), value: mapPlayed.toString(), inline: true });
    // Maps fail
    fields.push({ name: getLocale(lang, "embedSessionMapFailed"), value: mapFailed.toString(), inline: true });
    // Ratio finish/fail
    if (mapFailed != 0) {
        fields.push({ name: 'Ratio Finished/Fail', value: convertIntegerToString(Math.round((mapFinished / mapFailed) * 100) / 100) + '/1', inline: true })
    } else {
        fields.push(blank);
    }
    // Rank progress
    if (session.gainedRank4k != 0) {
        fields.push({ name: getLocale(lang, "embedSessionRankProgress") + " - 4K", value: session.initialRank4k.toString() + " -> " + (session.initialRank4k - session.gainedRank4k).toString(), inline: true });
    }
    if (session.gainedRank7k != 0) {
        fields.push({ name: getLocale(lang, "embedSessionRankProgress") + " - 7K", value: session.initialRank7k.toString() + " -> " + (session.initialRank7k - session.gainedRank7k).toString(), inline: true });
    }

    // Creating the graph
    const prefs = {}
    prefs.imageUrl = user.sessionImageUrl;
    prefs.difficultyLineColor = user.sessionDifficultyLineColor;
    prefs.accuracyLineColor = user.sessionAccuracyLineColor;
    const sessionGraph = await Chart.createSessionGraph(graphModes, graphPr, graphGrades, graphDiff, graphAcc, prefs).getShortUrl();

    let dateFormat;
    switch (lang) {
        case "fr":
            dateFormat = session.sessionStartDate.toLocaleDateString("fr-FR", { day: 'numeric', month: 'numeric' });
            break;
        case "en":
            dateFormat = session.sessionStartDate.toLocaleDateString("en-US", { month: 'numeric', day: 'numeric' });
            break;
    }

    const embedAbstract = new EmbedBuilder()
        .setColor(getRatingColor(difficulty))
        .setTitle(getLocale(lang, "embedSessionTitle", player.username, dateFormat))
        .setURL(`https://quavergame.com/user/${player.id}`)
        .setAuthor({ name: player.username, iconURL: player.avatar_url })
        .setDescription(comment)
        .addFields(fields)
        .setImage(sessionGraph)
        .setFooter({ text: `${getLocale(lang, "embedSessionTimeDuration")}: ${convertIntegerToTime(session.sessionTimeDuration)}` })

    if (player.avatar_url != null) {
        embedAbstract.setThumbnail(`${player.avatar_url}`);
    }

    // If this function is called from a specific command (/showSession)
    if (interaction != null) {
        return interaction.editReply({ embeds: [embedAbstract] });
    }

    // If this function is called from somewhere else (/end-session or auto)
    return channel.send({ embeds: [embedAbstract] });
}

export default { manageSessions, showSession };