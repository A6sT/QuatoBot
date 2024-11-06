import DB from './db.js';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { getLocale, getGradeColor, isScoreFiltered, convertIntegerToString, client } from './index.js';

// Websocket implementation (ignore for now as new site isn't finished yet)
/*import WebSocket from 'ws';

const ws = new WebSocket('ws://www.host.com/path');

ws.on('error', console.error);

ws.on('open', function open() {
    console.log("connexion established");
});

ws.on('message', function message(data) {
    console.log('received: %s', data);
    if (data == null || data.type == null) { return; }
    switch (data.type) {
        case "new_score":
            console.log("new score found, this is epic !!!!!!!");
            // TODO LIST:
            // 1. Edit registerNewScores() to handle response messages
            // 2. rename seekNewScores() to "newScoreProcess()", and call it at the end of the registerNewScore()
            break;
        case "connected":
            console.log("Now listening for new scores");
            break;
        default:
            break;
    }
});
// We will also have to take care of newly registered users to the bot (we need to add them to the ws route)
/* For websocket implementation, score found response should look like this: (with api V2, this has probably changed and will probably change again in the future)
{
    "type": "new_score",
    "data": {
        "map_md5": "2",
        "game_mode": 1,
        "mods": 0,
        "failed": false,
        "total_score": 1234567,
        "accuracy": 22.22,
        "max_combo": 123,
        "count_marv": 6,
        "count_perf": 5,
        "count_great": 4,
        "count_good": 3,
        "count_okay": 2,
        "count_miss": 1,
        "username": "test",
        "combo_at_end": 0,
        "health_at_end": 0
    }
}
*/

// Get and display scores made by users linked to the bot
export async function main() {
    const users = [];
    let dbUsers = await DB.getUsers();
    dbUsers.forEach(async function (user) {
        users.push(user);
    })

    const date = new Date();
    users.forEach(async function (user) {
        seekNewScores(user);

        // Reset tracker for daily ranking
        if ((date.getUTCHours() + user.timezoneOffset) % 24 == 0 && date.getUTCMinutes() == 0) {
            DB.resetDailyCounter(user.discordId);
        }
    })
}

// Look for new scores made by the users
async function seekNewScores(user) {
    const scoreRegistered = await registerNewScore(user, true);
    if (scoreRegistered == null) { return; }

    /// A new score is found

    // Send this new score to every channel where it is not filtered
    if (isScoreFiltered(user.filter, scoreRegistered.score) == false) {
        const servers = await DB.getServersList(user.server);

        for (let i = 0; i < servers.length; i++) {
            let server = servers[i];
            let personalChannel = await DB.getPersonalChannel(server.serverId, user.discordId);

            const serverCache = client.guilds.cache.get(server.serverId);
            if (server.scoreChannel != "") {

                // Send message to global channel
                const globalChannel = serverCache.channels.cache.get(server.scoreChannel);
                if (globalChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                    await showLatestScore(server, globalChannel, scoreRegistered);
                }
            }

            if (personalChannel != null) {

                // Send message to personal channel
                const channelPerso = serverCache.channels.cache.get(personalChannel.channel);
                if (channelPerso.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                    await showLatestScore(server, channelPerso, scoreRegistered);
                }
            }
        }
    }
}

// Send request to Quaver's API to see if the latest score is the same as what is in the db
export async function registerNewScore(user, isSessionManaged) {
    let mode;
    let score, score4k, score7k;
    let globalRank, dailyRank, newGlobalRank, newDailyRank;

    await axios.all([
        axios.get('https://api.quavergame.com/v1/users/scores/recent?id=' + user.quaverId + '&mode=1')//,
        //axios.get('https://api.quavergame.com/v1/users/scores/recent?id=' + user.quaverId + '&mode=2')
    ]).then(axios.spread(async (scoreRes4K, scoreRes7K) => {
        score4k = scoreRes4K.data.scores[0];
        //score7k = scoreRes7K.data.scores[0]; // 7K is temporarly disabled to prevent more API polling

    })).catch(function (error) {
        return;
    });

    // === Check if the score is valid (aka the latest) ===

    // Check if it is 4k or 7k
    // -> Variable will be adapted according to the game mode
    let latestPlay4K;
    let latestPlay7K;
    let gamemodesPlayed = 0;
    let scoreIs4k;

    if (score4k != null) {
        latestPlay4K = new Date(score4k.time);
        gamemodesPlayed++;
    }
    if (score7k != null) {
        latestPlay7K = new Date(score7k.time);
        gamemodesPlayed++;
    }

    // Check the amount of game mode the user has played
    switch (gamemodesPlayed) {
        case 0: // No score, the user never played
            return;
        case 1: // The player either played 4k or 7k 
            latestPlay4K != null ? scoreIs4k = true : scoreIs4k = false;
            break;
        default: // The player played both game mode
            // We take the latest score
            latestPlay4K.getTime() > latestPlay7K.getTime() ? scoreIs4k = true : scoreIs4k = false;
    }

    scoreIs4k ? score = score4k : score = score7k;
    const newTimeStamp = score.time;

    // We check if the latest score found is the same as what we have in the database
    if (Math.floor(new Date(newTimeStamp).getTime() / 1000) == Math.floor(user.latestMapPlayedTimestamp.getTime() / 1000)) {
        return;
    }
    // === From here, we know that the score we retrieved is a new one ===

    const player = await getPlayerInfo(user.quaverId);
    const map = await getMapInfo(score.map.id);

    if (scoreIs4k) {
        mode = 4;
        globalRank = user.globalRank4k;
        newGlobalRank = player.keys4.globalRank;
        dailyRank = user.dailyRank4k;
        newDailyRank = dailyRank + globalRank - newGlobalRank;
    } else {
        mode = 7;
        globalRank = user.globalRank7k;
        newGlobalRank = player.keys7.globalRank;
        dailyRank = user.dailyRank7k;
        newDailyRank = dailyRank + globalRank - newGlobalRank;
    }

    // Create a game session if the user doesn't have one yet
    const userHaveSession = await DB.userHaveSession(user.discordId);
    if (isSessionManaged && !userHaveSession) {
        await DB.createSession(user.discordId);
    }

    // Prepare object with all informations that will be used to display the score
    const newScore = {
        id: score.id,
        user: user,
        player: player,
        map: map,
        score: score,
        mode: mode,
        globalRank: globalRank,
        newGlobalRank: newGlobalRank,
        dailyRank: dailyRank,
        newDailyRank: dailyRank + globalRank - newGlobalRank
    }

    // We save that score to the database as the new latest score
    await DB.editUser(user.discordId, newTimeStamp, mode, newGlobalRank, newDailyRank);
    if (isSessionManaged) {
        await DB.addScoreToSession(user.discordId, newScore);
    }

    // Submit score to daily challenge if it isn't "cheated"
    if (!score.mods_string.includes('NLN') && !score.mods_string.includes('NSV')) {
        await DB.registerNewDailyScore(newScore);
    }
    return newScore;
}

// Get a map infos
async function getMapInfo(id) {
    let map;
    await axios.get('https://api.quavergame.com/v1/maps/' + id).then(async function (m) {
        map = m.data.map;
    })
    return map;
}

// Get a player infos
async function getPlayerInfo(quaverId) {
    let player;
    await axios.get('https://api.quavergame.com/v1/users/full/' + quaverId).then(async function (p) {
        player = p.data.user;
    })
    return player;
}

// Send a message to a server that contains infos about the latest score from a player
async function showLatestScore(server, channel, newScore) {
    const user = newScore.user,
        player = newScore.player,
        map = newScore.map,
        score = newScore.score,
        mode = newScore.mode,
        globalRank = newScore.globalRank,
        newGlobalRank = newScore.newGlobalRank,
        dailyRank = newScore.dailyRank,
        newDailyRank = newScore.newDailyRank,
        lang = server.language;

    const playerInfo = player.info;

    // Parsing
    const pr = convertIntegerToString(Math.round(score.performance_rating * 100) / 100);
    const acc = convertIntegerToString(Math.round(score.accuracy * 100) / 100);
    const ratio = convertIntegerToString(Math.round(score.ratio * 100) / 100);
    let difficulty_rating = Math.round((score.performance_rating / Math.pow(score.accuracy / 98, 6)) * 100) / 100;

    // Check if the user rank has changed
    let rankupMessage = "";

    if (newGlobalRank != globalRank) {
        // Creating the message for rank change
        if (newGlobalRank > globalRank) {
            rankupMessage = `🔴 ${(newGlobalRank - globalRank)} ${getLocale(lang, "embedScoreRankLost")}: ${globalRank} -> ${newGlobalRank}`;
        } else {
            rankupMessage = `🟢 ${(globalRank - newGlobalRank)} ${getLocale(lang, "embedScoreRankGained")}: ${globalRank} -> ${newGlobalRank}`;
        }
    }
    if (newDailyRank != 0) {
        rankupMessage += ` (${newDailyRank > 0 ? "+" : ""}${newDailyRank} ${getLocale(lang, "embedScoreToday")})`;
    }

    // Check if the map is failed
    let description;
    if (score.grade == 'F') {
        difficulty_rating = '';
        description = getLocale(lang, "embedScoreMapFailed", `<@${user.discordId}>`);
    } else {
        difficulty_rating = ` (${convertIntegerToString(difficulty_rating.toString())})`;
        description = getLocale(lang, "embedScoreMapFinished", `<@${user.discordId}>`);
    }

    // Manage BPM and speed modifiers
    let bpm = map.bpm;
    const speedModifierPosition = score.mods_string.search(/[0-2].[0-9]{1,2}/);
    if (speedModifierPosition != -1) {
        let speedModifier = score.mods_string.substring(speedModifierPosition);
        speedModifier = speedModifier.substring(0, speedModifier.search(/x/));
        bpm *= speedModifier;
        bpm = Math.round(bpm * 100) / 100;
    }

    // Message creation
    let titleMapInfo = `${map.artist} - ${map.title} - [${map.difficulty_name}]`;
    if (titleMapInfo.length > 230) {
        titleMapInfo = `${titleMapInfo.substring(0, 230)}...`;
    }
    const fields = [
        { name: 'Performance Rating', value: pr, inline: true }, // PR
        { name: 'Accuracy', value: acc + '%', inline: true }, // Acc
        { name: 'Ratio', value: ratio, inline: true }, // Ratio
        { name: 'Max Combo', value: score.max_combo.toString(), inline: true }, // Max combo
    ]

    if (bpm != 0) {
        fields.push({ name: 'BPM', value: bpm.toString(), inline: true });
    }

    // Only display modifiers if there is at least one
    if (score.mods_string != 'None') {
        fields.push({ name: 'Mods', value: score.mods_string, inline: true });
    }

    // Only display leaderboard rank if the user is in the top 50
    if (map.ranked_status == 2) {
        await axios.get(`https://api.quavergame.com/v1/scores/map/${map.id}`).then(async (res) => {
            const scores = res.data.scores;

            for (let i = 0; i < scores.length; i++) {
                if (scores[i].id == score.id) {
                    fields.push({ name: 'Global', value: '🏆 #' + (i + 1).toString() + ' of Top ' + scores.length, inline: true });
                }
            }
        });
    } else {
        fields.push({ name: '\u200b', value: `**${getLocale(lang, "embedScoreMapNotRanked")}**`, inline: false });
    }

    const color = getGradeColor(score.grade);

    const embedScore = new EmbedBuilder()
        .setColor(color)
        .setTitle(`[${mode}K] ${titleMapInfo}${difficulty_rating}`)
        .setURL(`https://quavergame.com/mapset/map/${map.id}`)
        .setAuthor({ name: playerInfo.username, iconURL: playerInfo.avatar_url, url: `https://quavergame.com/user/${playerInfo.id}` })
        .setDescription(`${getLocale(lang, "embedScoreCreatedBy", map.creator_username)}\n\n${description}`)
        .setThumbnail(`https://static.quavergame.com/img/grades/${score.grade}.png`) // Link to the grade image
        .addFields(fields)
        .setImage(`https://cdn.quavergame.com/mapsets/${map.mapset_id}.jpg`) // Mapset background
        .setTimestamp()

    // Displays rankup message
    if (rankupMessage != null && rankupMessage.length > 0) {
        embedScore.setFooter({ text: rankupMessage })
    }

    // Send message to the channel
    const m = await channel.send({ embeds: [embedScore] });

    // Add emotes
    try {
        // FC
        if (score.count_miss == 0) {
            if (score.count_great == 0) {
                await m.react('<:pfc:977246030263353355>');
            } else {
                await m.react('<:gfc:1151811405754933270>');
            }
        }
        // PB
        if (score.personal_best == true) {
            await m.react('<:pb:1115302002197536789>');
        }
    } catch (ex) {
        console.log(ex);
    }
}

export default { main, registerNewScore };