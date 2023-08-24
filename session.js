import DB from './db.js';
import axios from 'axios';
import Chart from './chart.js';
import { EmbedBuilder } from 'discord.js';
import { getLocale, getRatingColor, convertIntegerToTime, convertIntegerToString, client } from './index.js';

// Gestion des sessions de jeu
export async function manageSessions() {

    // Mise a jour des sessions actives
    await DB.updateActiveSession();

    // Envois des informations sur les sessions inactives et suppression
    const expiredSessions = await DB.getExpiredSessions();
    expiredSessions.forEach(async (session) => {

        // On affiche uniquement le r�sum� pour les sessions ayant au moins 5 score
        if (session.scores.length >= 5) {
            const user = await DB.getUser(session.discordId);
            const servers = await DB.getServersList(user == null ? null : user.server);

            for (let i = 0; i < servers.length; i++) {
                let server = servers[i];
                let personalChannel = await DB.getPersonalChannel(server.serverId, user.discordId);
                if (server.sessionChannel != "") {

                    // Envoie du message dans le channel global
                    const globalChannel = client.guilds.cache.get(server.serverId).channels.cache.get(server.sessionChannel);
                    await showSession(server.language, globalChannel, session);
                }
                if (personalChannel != null) {

                    // Envoie du message dans le channel perso
                    const channelPerso = client.guilds.cache.get(server.serverId).channels.cache.get(personalChannel.channel);
                    await showSession(server.language, channelPerso, session);
                }

            }

        }
        DB.destroySession(session.discordId);
    })
}

// Afficher la session d'un utilisateur (termin� ou non)
export async function showSession(lang, channel, session, interaction = null, commentaire = null) {
    // R�cuperer les infos sur l'utilisateur de la session
    const user = await DB.getUser(session.discordId);
    let player, playerInfo;

    await axios.get('https://api.quavergame.com/v1/users/full/' + user.quaverId).then((res) => {
        player = res.data.user;
        playerInfo = player.info;
    })

    // Pr�paration des infos pour r�sumer la session
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
        if (score.personal_best) {
            pbAmount++;
        }
        if (score.count_miss == 0) {
            fcAmount++;
        }

        // Prise d'information pour le graphique
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

    // Cr�ation des fields pour l'embed de la session
    if (commentaire == null) {
        commentaire = getLocale(lang, "embedSessionDefaultCommentary", `<@${user.discordId}>`);
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
    // Maps jou�s
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

    // Creation du Graph
    const sessionGraph = Chart.createSessionGraph(graphModes, graphPr, graphGrades, graphDiff, graphAcc, user.sessionImageUrl);

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
        .setTitle(getLocale(lang, "embedSessionTitle", playerInfo.username, dateFormat))
        .setURL(`https://quavergame.com/user/${playerInfo.id}`)
        .setAuthor({ name: playerInfo.username, iconURL: playerInfo.avatar_url }) // Info sur le joueur
        .setDescription(commentaire)
        .addFields(fields)
        .setImage(await sessionGraph.getShortUrl())
        .setFooter({ text: `${getLocale(lang, "embedSessionTimeDuration")}: ${convertIntegerToTime(session.sessionTimeDuration)}` })
        .setTimestamp()

    if (playerInfo.avatar_url != null) {
        embedAbstract.setThumbnail(`${playerInfo.avatar_url}`);
    }

    // Si la demande de vision de session est issue d'une interaction (/showSession)
    if (interaction != null) {
        return interaction.editReply({ embeds: [embedAbstract] });
    }

    // Si la demande provient d'une autre source (/end-session OU automatique)
    return channel.send({ embeds: [embedAbstract] });
}

export default { manageSessions, showSession };