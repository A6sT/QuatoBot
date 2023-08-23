import DB from './db.js';
import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { getLocale, getGradeColor, isScoreFiltered, convertIntegerToString, client } from './index.js';
import WebSocket from 'ws';

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

    users.forEach(async function (user) {
        seekNewScores(user);
    })
}

// Rechercher et afficher les nouveaux scores fait par un utilisateur
async function seekNewScores(user) {
    const scoreRegistered = await registerNewScore(user);
    if (scoreRegistered == null) { return; }

    // Un nouveau score a été trouvé

    // Envoi du message sur les channels globaux de chaque serveur si le score n'est pas filtré sur ces serveurs
    if (isScoreFiltered(user.filter, scoreRegistered.score) == false) {
        const servers = await DB.getServersList(user.server);

        for (let i = 0; i < servers.length; i++) {
            let server = servers[i];
            let personalChannel = await DB.getPersonalChannel(server.serverId, user.discordId);

            // Envoie du message uniquement si un channel global est définit
            if (server.scoreChannel != "") {
                const globalChannel = client.guilds.cache.get(server.serverId).channels.cache.get(server.scoreChannel);
                showLatestScore(server, globalChannel, scoreRegistered);
            }

            // Envoie du message dans le channel perso
            if (personalChannel != null) {
                const channelPerso = client.guilds.cache.get(server.serverId).channels.cache.get(personalChannel.channel);
                showLatestScore(server, channelPerso, scoreRegistered);
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
        axios.get('https://api.quavergame.com/v1/users/scores/recent?id=' + user.quaverId + '&mode=1')//,
        //axios.get('https://api.quavergame.com/v1/users/scores/recent?id=' + user.quaverId + '&mode=2')
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
    const newTimeStamp = score.time;

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
    await axios.get('https://api.quavergame.com/v1/maps/' + id).then(async function (m) {
        map = m.data.map;
    })
    return map;
}

// Récuperer les informations sur un joueur
async function getPlayerInfo(quaverId) {
    let player;
    await axios.get('https://api.quavergame.com/v1/users/full/' + quaverId).then(async function (p) {
        player = p.data.user;
    })
    return player;
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

    const playerInfo = player.info;

    // Mise en forme des valeurs du score
    const pr = convertIntegerToString(Math.round(score.performance_rating * 100) / 100);
    const acc = convertIntegerToString(Math.round(score.accuracy * 100) / 100);
    const ratio = convertIntegerToString(Math.round(score.ratio * 100) / 100);
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
    rankupMessage += newDailyRank != 0 ? ` (${newDailyRank > 0 ? "+" : ""}${newDailyRank} ${getLocale(lang, "embedScoreToday")})` : "";

    // Verifier si la map est fail
    let description;
    if (score.grade == 'F') {
        difficulty_rating = '';
        description = getLocale(lang, "embedScoreMapFailed", `<@${user.discordId}>`);
    } else {
        difficulty_rating = ` (${convertIntegerToString(difficulty_rating.toString())})`
        description = getLocale(lang, "embedScoreMapFinished", `<@${user.discordId}>`);
    }

    // Gérer le BPM
    let bpm = map.bpm;

    // Calculer le bpm si il y a un modifier
    const speedModifierPosition = score.mods_string.search(/[0-2].[0-9]{1,2}/);
    if (speedModifierPosition != -1) {
        let speedModifier = score.mods_string.substring(speedModifierPosition);
        speedModifier = speedModifier.substring(0, speedModifier.search(/x/));
        bpm *= speedModifier;
        bpm = Math.round(bpm * 100) / 100;
    }

    // Couleur du message
    const color = getGradeColor(score.grade);

    // Création du message

    // Création des différents fields du message
    const fields = [
        { name: 'Performance Rating', value: pr, inline: true }, // PR
        { name: 'Accuracy', value: acc + '%', inline: true }, // Accu
        { name: 'Ratio', value: ratio, inline: true }, // Ratio
        { name: 'Max Combo', value: score.max_combo.toString(), inline: true }, // Max combo
    ]

    // Affichage du BPM, calculé et adapté en fonction du modifier
    if (bpm != 0) {
        fields.push({ name: 'BPM', value: bpm.toString(), inline: true });
    }

    // Affichage des modifiers uniquement si il y en a au moins 1
    if (score.mods_string != 'None') {
        fields.push({ name: 'Mods', value: score.mods_string, inline: true });
    }

    // On affiche le placement global si la map est ranked et que le score est dans le top 50
    if (map.ranked_status == 2) {
        // Comparaison avec tout les scores du top 50
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

    const embedScore = new EmbedBuilder()
        .setColor(color) // Couleur en rapport avec la note
        .setTitle(`[${mode}K] ${map.artist} - ${map.title} - [${map.difficulty_name}]${difficulty_rating}`) // Nom de la map et difficulté
        .setURL(`https://quavergame.com/mapset/map/${map.id}`) // Lien vers le site de la map (si dispo)
        .setAuthor({ name: playerInfo.username, iconURL: playerInfo.avatar_url, url: `https://quavergame.com/user/${playerInfo.id}` }) // Info sur le joueur
        .setDescription(`${getLocale(lang, "embedScoreCreatedBy", map.creator_username)}\n\n${description}`)
        .setThumbnail(`https://static.quavergame.com/img/grades/${score.grade}.png`) // Grade
        .addFields(fields)
        .setImage(`https://cdn.quavergame.com/mapsets/${map.mapset_id}.jpg`) // Background de la map
        .setTimestamp()

    // On affiche le message de rankup si le joueur à gagné / perdu des places
    if (rankupMessage != null && rankupMessage.length > 0) {
        embedScore.setFooter({ text: rankupMessage })
    }

    // Préparation de l'envoie du message
    const m = await channel.send({ embeds: [embedScore] });

    // Ajout des réactions
    try {
        // FC
        if (score.count_miss == 0) {
            await m.react('<:fc:977246030263353355>');
        }
        // PB
        if (score.personal_best == true) {
            await m.react('<:pb:1115302002197536789>');
        }
    } catch (ex) {
        console.log(ex);
    }
}

export default { main };