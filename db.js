import 'dotenv/config';
import {MongoClient} from 'mongodb';

// ============================== DB ==============================

class DB {

    #clientDb;
    #env;

    constructor() {
        // Connect to Database
        const uri = process.env.DB_CONNEXION_STRING;
        const clientDb = new MongoClient(uri);
        clientDb.connect();
        this.clientDb = clientDb;
        this.env = process.env.ENV;
    }

    // ============================== Global ==============================

    // Récuperer tout les serveurs de la db
    async getServers() {
        return await this.clientDb.db(this.env).collection("server").find().toArray();
    }

    // Récuperer un serveur 
    async getServer(serverId) {
        return await this.clientDb.db(this.env).collection("server").findOne({ serverId: serverId });
    }

    // Récuperer les serveurs parmis une liste d'id donné
    async getServersList(servers) {
        return await this.clientDb.db(this.env).collection("server").find({ serverId: { $in: servers } }).toArray();
    }

    createServer(serverId) {
        const db = this.clientDb.db(this.env);
        let newServer = {
            serverId: serverId.toString(),
            language: "en",
            sessionChannel: "",
            scoreChannel: "",
            multiplayerChannel: "",
            personalChannel: []
        }
        db.collection("server").insertOne(newServer, function (err, res) {
            if (err) throw err;
        })
    }

    // Définir le nouveau channel où s'this.envoie les sessions
    setSessionChannel(serverId, channelId) {
        let updatedServer = {
            $set: {
                sessionChannel: channelId,
            }
        }
        this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer)
    }

    // Définir le nouveau channel où s'envoie les scores récents
    setTrackerChannel(serverId, channelId) {
        let updatedServer = {
            $set: {
                scoreChannel: channelId,
            }
        }
        this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer)
    }

    // Définir le nouveau channel où s'envoie les infos de salles multijoueur
    setMultiplayerChannel(serverId, channelId) {
        let updatedServer = {
            $set: {
                multiplayerChannel: channelId,
            }
        }
        this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer)
    }

    // Définir la langue du bot pour un serveur
    async setLanguage(serverId, language) {
        let updatedServer = {
            $set: {
                language: language

            }
        }
        await this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer)
    }

    // Définir le channel perso lié a un utilisateur
    async setPersonalChannel(serverId, discordId, channelId) {
        const personalChannel = await this.getPersonalChannel(serverId, discordId);
        let condition = {};
        let updatedServer = {};

        // Si le joueur ciblé possède déja un channel perso, on le modifie
        if (personalChannel != null) {
            condition = { serverId: serverId, personalChannel: { $elemMatch: { user: discordId } } };
            updatedServer = {
                $set: {
                    "personalChannel.$.channel": channelId
                }
            }
        // Sinon, on crée un nouvel élement dans la liste
        } else {
            condition = { serverId: serverId };
            updatedServer = {
                $push: {
                    personalChannel: {
                        user: discordId, channel: channelId, filter: []
                    }
                }
            }
        }
        await this.clientDb.db(this.env).collection("server").updateOne(condition, updatedServer)
    }

    // Récuperer le channel perso d'un utilisateur d'un serveur
    async getPersonalChannel(serverId, discordId) {
        const server = await this.clientDb.db(this.env).collection("server").findOne({ serverId: serverId });
        if (server == null) {
            return null;
        }

        let personalChannel;
        server.personalChannel.forEach(channel => {
            if (channel.user == discordId) {
                personalChannel = channel;
            }
        })
        return personalChannel;
    }

    // Délier le channel perso d'un utilisateur
    async unsetPersonalChannel(serverId, discordId) {
        let updatedServer = {
            $pull: {
                personalChannel: { user: discordId }
            }
        }
        await this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer)
    }

    // Récuperer les filtres activés d'un utilisateur sur son channel perso
    async getPersonalFilters(serverId, discordId) {
        const personalChannel = await this.getPersonalChannel(serverId, discordId);
        if (personalChannel == null) {
            return null;
        }
        return personalChannel.filter;
    }

    // Activer / Désactiver un filtre pour un utilisateur sur le channel perso
    async setPersonalFilter(serverId, discordId, filter, enabler) {
        let updatedServer = {};

        if (enabler) {
            updatedServer = {
                $push: {
                    "personalChannel.$.filter": filter
                }
            }
        } else {
            updatedServer = {
                $pull: {
                    "personalChannel.$.filter": filter
                }
            }
        }
        await this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId, personalChannel: { $elemMatch: { user: discordId } } }, updatedServer)
    }

    // Supprimer les données d'un serveur
    // Note: supprimer les informations d'un serveur nécessite d'enlever les informations dans user
    async deleteServer(serverId) {
        await this.removeUsersFromServer(serverId);

        this.clientDb.db(this.env).collection("server").findOneAndDelete({ serverId: serverId });
    }

    // Supprimer un serveur sur lequel sont enregistrés les utilisateurs
    async removeUsersFromServer(serverId) {
        await this.clientDb.db(this.env).collection("user").updateMany({}, { $pull: { server: serverId } });

        await this.deleteUserWithNoServer();
    }

    // Supprimer les informations concernant un channel qui a été supprimé
    async findAndNullifyChannel(serverId, channelId) {
        const server = await this.getServer(serverId);
        if (server == null) { return; }
        let updatedServer = {
            $set: {},
            $pull: {
                personalChannel: { channel: channelId }
            }
        };

        if (server.sessionChannel == channelId) {
            updatedServer.$set["sessionChannel"] = "";
        }

        if (server.scoreChannel == channelId) {
            updatedServer.$set["scoreChannel"] = "";
        }

        if (server.multiplayerChannel == channelId) {
            updatedServer.$set["multiplayerChannel"] = "";
        }

        await this.clientDb.db(this.env).collection("server").updateOne({ serverId: serverId }, updatedServer);
    }

    // ============================== User ==============================

    // Récuperer tout les utilisateurs de la db
    async getUsers() {
        return await this.clientDb.db(this.env).collection("user").find().toArray();
    }

    // Récuperer un utilisateur de la db
    async getUser(discordId) {
        return await this.clientDb.db(this.env).collection("user").findOne({ discordId: discordId });
    }

    // Créer un utilisateur dans la db
    createUser(serverId, discordId, quaverId, globalRank4k, globalRank7k) {
        const db = this.clientDb.db(this.env);
        let newUser = {
            server: [serverId.toString()],
            discordId: discordId.toString(),
            quaverId: quaverId.toString(),
            filter: [],
            latestMapPlayedTimestamp: new Date(),
            sessionIdleTime: 30 * 60,
            timezoneOffset: 0,
            sessionImageUrl: '',
            sessionDifficultyLineColor: '',
            sessionAccuracyLineColor: '',
            globalRank4k: globalRank4k,
            globalRank7k: globalRank7k,
            dailyRank4k: 0,
            dailyRank7k: 0
        }
        db.collection("user").insertOne(newUser, function(err, res){
            if(err) throw err;
            console.log(`user ${quaverId} (${discordId}) has registered !`);
        })
    }

    // Modifier les informations d'un utilisateur de la db
    editUser(discordId, newTimeStamp, mode, newGlobalRank, newDailyRank) {
        let updatedUser = {
            $set: {
                latestMapPlayedTimestamp: new Date(newTimeStamp.toString()),
                ...(mode == 4) && { globalRank4k: newGlobalRank, dailyRank4k: newDailyRank },
                ...(mode == 7) && { globalRank7k: newGlobalRank, dailyRank4k: newDailyRank },
            }
        }
            
        this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, updatedUser)
    }

    // Ajouter un serveur à la liste des serveurs d'un utilisateur
    async addServerToUser(userId, serverId) {
        await this.clientDb.db(this.env).collection("user").updateOne({ discordId: userId }, { $push: { server: serverId } });
    }

    // Récuperer les filtres activés d'un utilisateur
    async getGlobalFilters(discordId) {
        const user = await this.getUser(discordId);
        return user.filter;
    }

    // Activer / Désactiver un filtre pour un utilisateur sur le channel global
    async setGlobalFilter(discordId, filter, enabler) {
        let updatedUser = {};

        if (enabler) {
            updatedUser = {
                $push: {
                    filter: filter
                }
            }
        } else {
            updatedUser = {
                $pull: {
                    filter: filter
                }
            }
        }
        await this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, updatedUser)
    }

    // Définir les préferences d'affichage sur le graphique de session
    async setSessionInfo(discordId, info) {
        let updatedUser = {
            $set: info
        }
        await this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, updatedUser)
    }

    // Désactiver tout les filtres pour un utilisateur
    async disableAllFilter(discordId) {
        let updatedUser = {
            $set: {
                filter: []
            }
        }
        await this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, updatedUser)
    }

    // Mise à jour du dailyRankCounter pour un utilisateur
    resetDailyCounter(discordId) {
        let updatedUser = {
            $set: {
                dailyRank4k: 0,
                dailyRank7k: 0
            }
        }
        this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, updatedUser)
    }

    // Supprimer un utilisateur d'un serveur
    async removeServerFromUser(discordId, serverId) {
        await this.clientDb.db(this.env).collection("user").updateOne({ discordId: discordId }, { $pull: { server: serverId } });
        await this.deleteUserWithNoServer();
    }

    // Supprimer un utilisateur de la db
    removeUser(discordId) {
        this.clientDb.db(this.env).collection("user").findOneAndDelete({ discordId: discordId })
    }

    // Supprimer les utilisateurs qui ne sont plus reliés à aucun serveur où le bot est présent
    async deleteUserWithNoServer() {
        await this.clientDb.db(this.env).collection("user").deleteMany({ server: [] });
    }

    // ============================== Session ==============================

    // Récuperer toutes les sessions de jeu en cours
    async getSessions() {
        return await this.clientDb.db(this.env).collection("session").find({ isMaxDurationReached: false });
    }

    // Récuperer la session de jeu d'un utilisateur
    async getSession(discordId) {
        return await this.clientDb.db(this.env).collection("session").findOne({ discordId: discordId });
    }

    // Récuperer toutes les sessions qui sont arrivés a terme (où le temps d'idle max a été atteint)
    async getExpiredSessions() {
        return await this.clientDb.db(this.env).collection("session").find({ isMaxDurationReached: true });
    }

    // Vérifie qu'une session existe pour un utilisateur donné
    async userHaveSession(discordId) {
        const session = await this.getSession(discordId);
        if (session != null) {
            return true;
        }
        return false;
    }

    // Créer une session en db
    async createSession(discordId) {
        if (await this.userHaveSession(discordId)) { return; }
        const user = await this.getUser(discordId);

        let newSession = {
            discordId: discordId,
            sessionStartDate: new Date(),
            sessionTimeDuration: 0,
            idleTime: 0,
            isMaxDurationReached: false,
            totalMapPlayed: 0,
            initialRank4k: user.globalRank4k,
            gainedRank4k: 0,
            initialRank7k: user.globalRank7k,
            gainedRank7k: 0,
            scores: []
        }
        await this.clientDb.db(this.env).collection("session").insertOne(newSession, function (err, res) {
            if (err) throw err;
        })
    }

    // Mettre à jour une session
    async updateActiveSession() {
        const sessions = await this.getSessions();
        sessions.forEach(async (session) => {
            let user = await this.getUser(session.discordId);
            let isMaxDurationReached = false;
            
            // If the user left the server before ending his session, destroy the session
            if(user == null){
                this.destroySession(session.discordId);
                return;
            }

            // Si la session arrive a terme, on ne l'update plus
            if (session.idleTime >= user.sessionIdleTime) {
                isMaxDurationReached = true
            } else {
                session.sessionTimeDuration += parseInt(process.env.REFRESH_SESSION_RATE, 10);
                session.idleTime += parseInt(process.env.REFRESH_SESSION_RATE, 10);
            }

            const updatedTime = {
                $set: {
                    sessionTimeDuration: session.sessionTimeDuration,
                    idleTime: session.idleTime,
                    isMaxDurationReached: isMaxDurationReached
                }
            }
            await this.clientDb.db(this.env).collection("session").updateOne({ discordId: session.discordId }, updatedTime);
        });
    }

    // Ajouter un score à une session présente dans la db
    async addScoreToSession(discordId, score) {
        let session = await this.getSession(discordId);
        if (session == null) { return; }

        // Construction de la structure stocké en db
        const newScore = {
            "mode": score.mode,
            "grade": score.score.grade,
            "performance_rating": score.score.performance_rating,
            "accuracy": score.score.accuracy,
            "max_combo": score.score.max_combo,
            "ratio": score.score.ratio,
            "personal_best": score.score.personal_best,
            "count_miss": score.score.count_miss
        }

        let updatedSession = {
            $set: {
                idleTime: 0,
                ...(score.mode == 4) && { gainedRank4k: session.gainedRank4k + score.globalRank - score.newGlobalRank },
                ...(score.mode == 7) && { gainedRank7k: session.gainedRank7k + score.globalRank - score.newGlobalRank },
                totalMapPlayed: session.totalMapPlayed + 1,
            },
            $push: {
                scores: newScore
            }
        }
        await this.clientDb.db(this.env).collection("session").updateOne({ discordId: discordId }, updatedSession);
        //this.addAllTimeScore(discordId, newScore);
    }

    // Supprimer une session de la db
    destroySession(discordId) {
        this.clientDb.db(this.env).collection("session").findOneAndDelete({ discordId: discordId });
    }

    // ============================== Multiplayer ==============================

    // Récuperer toutes les salles multijoueurs qui sont liés au bot
    async getMultiplayerRooms() {
        return await this.clientDb.db(this.env).collection("multiplayer").find().toArray();
    }

    // Récuperer une salle multijoueur lié au bout
    async getMultiplayerRoom(roomId) {
        return await this.clientDb.db(this.env).collection("multiplayer").findOne({ roomId: roomId });
    }

    // Créer une salle multijoueur
    async createMultiplayerRoom(roomId, password) {
        if (await this.getMultiplayerRoom(roomId)) { return; }

        let newRoom = {
            roomId: roomId,
            messageId: "",
            password: password,
        }
        await this.clientDb.db(this.env).collection("multiplayer").insertOne(newRoom, function (err, res) {
            if (err) throw err;
        })
    }

    async setMultiplayerRoomMessage(roomId, messageId) {
        let updatedRoom = {
            $set: {
                messageId: messageId
            }
        }
        await this.clientDb.db(this.env).collection("multiplayer").updateOne({ roomId: roomId }, updatedRoom);
    }

    // Supprimer une salle multijoueur de la db
    deleteMultiplayerRoom(roomId) {
        this.clientDb.db(this.env).collection("multiplayer").findOneAndDelete({ roomId: roomId })
    }

    /// DEPRECATED
    // ============================== Scores ==============================
    
    // Ajouter un score au résumé total de l'utilisateur
    async addAllTimeScore(discordId, score) {
        let newAllTimeScore = {
            discordId: discordId,
            timestamps: new Date(),
            mode: score.mode,
            grade: score.grade,
            performance_rating: score.performance_rating,
            accuracy: score.accuracy,
            max_combo: score.max_combo,
            ratio: score.ratio,
            personal_best: score.personal_best,
            count_miss: score.count_miss,
        }
        await this.clientDb.db(this.env).collection("score").insertOne(newAllTimeScore)
    }
}

export default new DB();