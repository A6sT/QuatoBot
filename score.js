import DB from './db.js';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { getLocale, getGradeColor, isScoreFiltered, convertIntegerToString, client } from './index.js';
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
            console.log("new score found");
            // 1. Il faut modifier la fonction registerNewScores pour que le résultat de cette requete y soit adapté
            // 2. Appeller la fonction seekNewScores (renommer en newScoreProcess) et appeler directement registerNewScores, puis enchainer le process habituel
            break;
        case "connected":
            console.log("Now listening for new scores");
            break;
        default:
            break;
    }
});
// Important: il faut faire attention au cas des utilisateurs qui se register au bot pour les ajouter sur le listener
/* For websocket implementation, score found response will be like:
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

// Récuperer et afficher les scores de tout les joueurs link au bot
export async function main() {

    const users = [];
    let dbUsers = await DB.getUsers();
    dbUsers.forEach(user => {
        users.push(user);
    })

    const date = new Date();
    users.forEach(async function (user) {
        seekNewScores(user);

        // Reset les trackeur de rank journalier
        if ((date.getUTCHours() + (isNaN(user.timezoneOffset) ? 0 : user.timezoneOffset)) % 24 == 0 &&
            date.getUTCMinutes() >= 0 && date.getUTCMinutes() <= 5 &&
            (user.dailyRank4k != 0 || user.dailyRank7k != 0)) {
            DB.resetDailyCounter(user.discordId);
        }
    })
}

// Rechercher et afficher les nouveaux scores fait par un utilisateur
async function seekNewScores(user) {
    const scoreRegistered = await registerNewScore(user);
    if (scoreRegistered == null) { return; }

    // Un nouveau score a été trouvé
    const servers = await DB.getServersList(user.server);

    for (let i = 0; i < servers.length; i++) {
        let server = servers[i];
        let personalChannel = await DB.getPersonalChannel(server.serverId, user.discordId);

        // Envoi du message sur les channels globaux de chaque serveur si le score n'est pas filtré sur ces serveurs
        if (!isScoreFiltered(user.filter, scoreRegistered.score)) {
            const serverCache = client.guilds.cache.get(server.serverId);
            if (server.scoreChannel != "") {
                // Envoie du message uniquement si un channel global est définit
                const globalChannel = serverCache.channels.cache.get(server.scoreChannel);
                if (globalChannel.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                    await showLatestScore(server, globalChannel, scoreRegistered);
                }
            }
        }

        // Envoie du message dans le channel perso si il n'est pas filtré
        if (personalChannel != null && !isScoreFiltered(personalChannel.filter, scoreRegistered.score)) {
            const channelPerso = serverCache.channels.cache.get(personalChannel.channel);
            if (channelPerso.permissionsFor(serverCache.members.me).toArray().includes("SendMessages")) {
                await showLatestScore(server, channelPerso, scoreRegistered);
            }
        }
    }
}

// Envoyer des requetes à l'API Quaver afin d'enregistrer le score le plus récent d'un utilisateur
async function registerNewScore(user) {
    let mode;
    let score, score4k, score7k;
    let globalRank, dailyRank, newGlobalRank, newDailyRank;

    await axios.all([
        axios.get(`https://api.quavergame.com/v2/user/${user.quaverId}/scores/1/recent`)//,
        //axios.get(`https://api.quavergame.com/v2/user/${user.quaverId}/scores/2/recent`)
    ]).then(axios.spread(async (scoreRes4K, scoreRes7K) => {
        // Exploitation des informations récupérés
        score4k = scoreRes4K.data.scores[0];
        //score7k = scoreRes7K.data.scores[0];

    })).catch(function (error) {
        return;
    });

    // === Déterminer si le score est valide (= le plus récent) ===

    // Déterimne si le score le plus récent est en 4k ou 7k 
    // -> Les variables seront adapté en fonction du score le plus récent pour pouvoir prendre en compte tout les modes de jeu
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

    // Déterminer le nombre de modes de jeux auquel l'utilisateur a joué
    switch (gamemodesPlayed) {
        case 0: // Aucun score, le joueur n'a jamais joué
            return;
        case 1: // Le joueur n'a que joué en 4k ou 7k
            latestPlay4K != null ? scoreIs4k = true : scoreIs4k = false;
            break;
        default: // Le joueur a joué dans les 2 modes de jeu
            // On récupère le score le plus récent
            latestPlay4K.getTime() > latestPlay7K.getTime() ? scoreIs4k = true : scoreIs4k = false;
    }

    scoreIs4k ? score = score4k : score = score7k;
    const newTimeStamp = score.timestamp;

    // Si le score trouvé correspond au score enregistré précedement
    if (Math.floor(new Date(newTimeStamp).getTime() / 1000) == Math.floor(user.latestMapPlayedTimestamp.getTime() / 1000)) {
        return;
    }
    // === Fin des vérifications, il s'agit bien d'un nouveau score ===

    const player = await getPlayerInfo(user.quaverId);
    const map = await getMapInfo(score.map.id);

    if (scoreIs4k) {
        mode = 4;
        globalRank = user.globalRank4k;
        newGlobalRank = player.stats_keys4.ranks.global;
        dailyRank = user.dailyRank4k;
        newDailyRank = dailyRank + globalRank - newGlobalRank;
    } else {
        mode = 7;
        globalRank = user.globalRank7k;
        newGlobalRank = player.stats_keys7.ranks.global;
        dailyRank = user.dailyRank7k;
        newDailyRank = dailyRank + globalRank - newGlobalRank;
    }

    // Créer une session pour l'utilisateur si il n'en a pas
    const userHaveSession = await DB.userHaveSession(user.discordId);
    if (!userHaveSession) {
        await DB.createSession(user.discordId);
    }

    // Préparation de l'objet a utiliser pour enregistrer le score et l'affichage
    const newScore = {
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

    // On enregistre le nouveau score dans la db et dans la session du joueur
    await DB.editUser(user.discordId, newTimeStamp, mode, newGlobalRank, newDailyRank);
    await DB.addScoreToSession(user.discordId, newScore);

    return newScore;
}

// Récuperer les informations sur une map
async function getMapInfo(id) {
    let map;
    await axios.get('https://api.quavergame.com/v2/map/' + id).then(async function (m) {
        map = m.data.map;
    })
    return map;
}

// Récuperer les informations sur un joueur
async function getPlayerInfo(quaverId) {
    let player;
    await axios.get('https://api.quavergame.com/v2/user/' + quaverId).then(async function (p) {
        player = p.data.user;
    })
    return player;
}

// Récuperer les informations sur un clan
async function getClan(clanId) {
    let clan;
    await axios.get('https://api.quavergame.com/v2/clan/' + clanId).then(async function (p) {
        clan = p.data.clan;
    })
    return clan;
}

function computeModsId(modifiers) {
    const binaryModList = (modifiers).toString(2)
    let modIdList = [];
    let modFound = false;
    for (let i = binaryModList.length - 1; i >= 0; i--) {
        if (binaryModList[i] == 1) {
            modIdList.push(binaryModList.length - i - 1);
            modFound = true;
        }
    }

    let modsStr = "";
    if (!modFound) { return modsStr; }

    modIdList.forEach(id => {
        switch (id) {
            case 0:
                modsStr += "NSV";
                break;
            case 1:
                modsStr += "0.5x";
                break;
            case 2:
                modsStr += "0.6x";
                break;
            case 3:
                modsStr += "0.7x";
                break;
            case 4:
                modsStr += "0.8x";
                break;
            case 5:
                modsStr += "0.9x";
                break;
            case 6:
                modsStr += "1.1x";
                break;
            case 7:
                modsStr += "1.2x";
                break;
            case 8:
                modsStr += "1.3x";
                break;
            case 9:
                modsStr += "1.4x";
                break;
            case 10:
                modsStr += "1.5x";
                break;
            case 11:
                modsStr += "1.6x";
                break;
            case 12:
                modsStr += "1.7x";
                break;
            case 13:
                modsStr += "1.8x";
                break;
            case 14:
                modsStr += "1.9x";
                break;
            case 15:
                modsStr += "2.0x";
                break;
            case 16:
                modsStr += "Strict";
                break;
            case 17:
                modsStr += "Chill";
                break;
            case 18:
                modsStr += "No Pause";
                break;
            case 19:
                modsStr += "Autoplay";
                break;
            case 20:
                modsStr += "Paused";
                break;
            case 21:
                modsStr += "NF";
                break;
            case 22:
                modsStr += "NLN";
                break;
            case 23:
                modsStr += "RND";
                break;
            case 24:
                modsStr += "0.55x";
                break;
            case 25:
                modsStr += "0.65x";
                break;
            case 26:
                modsStr += "0.75x";
                break;
            case 27:
                modsStr += "0.85x";
                break;
            case 28:
                modsStr += "0.95x";
                break;
            case 29:
                modsStr += "INV";
                break;
            case 30:
                modsStr += "FLN";
                break;
            case 31:
                modsStr += "Mirror";
                break;
            case 32:
                modsStr += "Coop";
                break;
            case 33:
                modsStr += "1.05x";
                break;
            case 34:
                modsStr += "1.15x";
                break;
            case 35:
                modsStr += "1.25x";
                break;
            case 36:
                modsStr += "1.35x";
                break;
            case 37:
                modsStr += "1.45x";
                break;
            case 38:
                modsStr += "1.55x";
                break;
            case 39:
                modsStr += "1.65x";
                break;
            case 40:
                modsStr += "1.75x";
                break;
            case 41:
                modsStr += "1.85x";
                break;
            case 42:
                modsStr += "1.95x";
                break;
            case 43:
                modsStr += "Skill issue";
                break;
            case 42:
                modsStr += "NM";
                break;
        }
        modsStr += " ";
    })
    return modsStr;
}

// Envoyer un message sur un serveur qui affiche le score récent d'un utilisateur
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

    // Mise en forme des valeurs du score
    const pr = convertIntegerToString(Math.round(score.performance_rating * 100) / 100);
    const acc = convertIntegerToString(Math.round(score.accuracy * 100) / 100);
    const ratio = convertIntegerToString(Math.round((score.count_marvelous / (score.count_perfect + score.count_great + score.count_good + score.count_okay + score.count_miss)) * 100) / 100);
    let difficulty_rating = Math.round((score.performance_rating / Math.pow(score.accuracy / 98, 6)) * 100) / 100;

    // Determine si le rank du joueur a changé
    let rankupMessage = "";

    if (newGlobalRank != globalRank) {
        // Mise en place du message
        if (newGlobalRank > globalRank) {
            rankupMessage = `🔴 ${(newGlobalRank - globalRank)} ${getLocale(lang, "embedScoreRankLost")}: ${globalRank} -> ${newGlobalRank}`;
        } else {
            rankupMessage = `🟢 ${(globalRank - newGlobalRank)} ${getLocale(lang, "embedScoreRankGained")}: ${globalRank} -> ${newGlobalRank}`;
        }
    }
    if (newDailyRank != 0) {
        rankupMessage += ` (${newDailyRank > 0 ? "+" : ""}${newDailyRank} ${getLocale(lang, "embedScoreToday")})`;
    }

    // Verifier si la map est fail
    let description;
    if (score.grade == 'F') {
        difficulty_rating = '';
        description = getLocale(lang, "embedScoreMapFailed", `<@${user.discordId}>`);
    } else {
        difficulty_rating = ` (${convertIntegerToString(difficulty_rating.toString())})`;
        description = getLocale(lang, "embedScoreMapFinished", `<@${user.discordId}>`);
    }

    // Gérer le BPM
    let bpm = map.bpm;

    // Calculer le bpm si il y a un modifier 
    const modifiersString = computeModsId(score.modifiers);
    const speedModifierPosition = modifiersString.search(/[0-2].[0-9]{1,2}/);
    
    if (speedModifierPosition != -1) {
        let speedModifier = modifiersString.substring(speedModifierPosition);
        speedModifier = speedModifier.substring(0, speedModifier.search(/x/));
        bpm *= speedModifier;
        bpm = Math.round(bpm * 100) / 100;
    }

    // Gestion du clan
    const clan = player.clan_id != null ? await getClan(player.clan_id) : null;
    const tag = clan != null ? `[${clan.tag}] ` : "";

    // Création du message
    let titleMapInfo = `${map.artist} - ${map.title} - [${map.difficulty_name}]`;
    if (titleMapInfo.length > 230) {
        titleMapInfo = `${titleMapInfo.substring(0, 230)}...`;
    }
    // Création des différents fields du message
    const fields = [
        { name: 'Performance Rating', value: pr, inline: true },
        { name: 'Accuracy', value: acc + '%', inline: true },
        { name: 'Ratio', value: ratio, inline: true },
        { name: 'Max Combo', value: score.max_combo.toString(), inline: true },
    ]

    // Affichage du BPM, calculé et adapté en fonction du modifier
    if (bpm != 0) {
        fields.push({ name: 'BPM', value: bpm.toString(), inline: true });
    }

    // Affichage des modifiers uniquement si il y en a au moins 1
    if (modifiersString != "") {
        fields.push({ name: 'Mods', value: modifiersString, inline: true });
    }

    // On affiche le placement global si la map est ranked et que le score est dans le top 50
    if (map.ranked_status == 2) {
        // Comparaison avec tout les scores du top 50
        await axios.get(`https://api.quavergame.com/v2/scores/${map.md5}/global`).then(async (res) => {
            const scores = res.data.scores;
            let found = false;

            for (let i = 0; i < scores.length && !found; i++) {
                if (scores[i].id == score.id) {
                    fields.push({ name: 'Global', value: `🏆 #${i + 1} of Top ${scores.length}`, inline: true });
                    found = true;
                }
            }
        });
    } else {
        fields.push({ name: '\u200b', value: `**${getLocale(lang, "embedScoreMapNotRanked")}**`, inline: false });
    }

    const color = getGradeColor(score.grade);

    const embedScore = new EmbedBuilder()
        .setColor(color) // Couleur en rapport avec la note
        .setTitle(`[${mode}K] ${titleMapInfo}${difficulty_rating}`) // Nom de la map et difficulté
        .setURL(`https://quavergame.com/mapset/map/${map.id}`) // Lien vers le site de la map (si dispo)
        .setAuthor({ name: `${tag}${player.username}`, iconURL: player.avatar_url, url: `https://quavergame.com/user/${player.id}` }) // Info sur le joueur
        .setDescription(`${getLocale(lang, "embedScoreCreatedBy", map.creator_username)}\n\n${description}`)
        .setThumbnail(`https://static.quavergame.com/img/grades/${score.grade}.png`) // Grade
        .addFields(fields)
        .setImage(`https://cdn.quavergame.com/mapsets/${map.mapset_id}.jpg`) // Background de la map

    // On affiche le message de rankup si le joueur à gagné / perdu des places
    if (rankupMessage != "") {
        embedScore.setFooter({ text: `${rankupMessage}` })
    }

    // Préparation de l'envoie du message
    const m = await channel.send({ embeds: [embedScore] });

    // Ajout des réactions
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
        if (score.is_personal_best == true) {
            await m.react('<:pb:1115302002197536789>');
        }
    } catch (ex) {
        console.log(ex);
    }
}

export default { main };