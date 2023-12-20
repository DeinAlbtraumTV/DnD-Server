const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const SERVER_VERSION = "1.0.1"
const MIN_CLIENT_VERSION = "1.0.1"

let sessions = new Map()

class GameSession {
    constructor (code) {
        this.session_code = code;
    }

    static generateID() {
        //TODO change implementation to use something like uuid, not this shit implementation
        let code = Math.random().toString(36).substring(2, 11)

        sessions.forEach(session => {
            if (session.session_code === code) {
                return this.generateID()
            }
        });

        return code
    };
}

io.on('connection', (socket) => {
    socket.emit("version-check", {
        serverVer: SERVER_VERSION,
        minClientVer: MIN_CLIENT_VERSION
    })    

    socket.on("sync", (data, callback) => {
        if (typeof(callback) != "function") return

        let session_exists = sessions.has(data.session_code)

        if (session_exists) {
            let session = sessions.get(data.session_code)

            callback({
                hasDm: (session.dm != "" && session.dm != undefined),
                url: session.url ?? "",
                tokens: session.tokens ?? [],
                session_exists: true
            })

            if (socket.rooms.size > 0) {
                var rooms = io.sockets.adapter.sids[socket.id];
                for(var room in rooms) {
                    socket.leave(room);
                }
            }

            socket.join(data.session_code)

            return
        }

        callback({
            session_exists: false
        })
    })

    socket.on("createSession", (callback) => {
        if (typeof(callback) != "function") return

        let code = GameSession.generateID()

        let session = new GameSession(code)

        session.dm = socket.id
        session.dmSocket = socket

        sessions.set(
            code,
            session
        )

        if (socket.rooms.size > 0) {
            var rooms = io.sockets.adapter.sids[socket.id];
            for(var room in rooms) {
                socket.leave(room);
            }
        }

        socket.join(code)

        callback({
            session_code: code
        })

        console.log("Session", code, "created by", socket.id)
    })

    socket.on("joinSession", (data, callback) => {
        if (typeof(callback) != "function") return

        if (!sessions.has(data.session_code)) {
            callback({
                status: "session not found",
                invalidSession: true,
                joined: false
            });
            return
        }

        let session = sessions.get(data.session_code)

        if (socket.rooms.size > 0) {
            var rooms = io.sockets.adapter.sids[socket.id];
            for(var room in rooms) {
                socket.leave(room);
            }
        }

        socket.broadcast.to(data.session_code).emit("addPlayer", {
            player: socket.id,
            playerName: data.playerName,
            initiative: data.initiative,
            initiativeModifier: data.initiativeModifier
        })

        socket.join(data.session_code)

        callback({
            joined: true,
            url: session.url ?? ""
        })

        socket.broadcast.to(data.session_code).emit("syncPlayerData")

        console.log("Session", data.session_code, "joined by", socket.id)
    })

    socket.on("leaveSession", (data, callback) => {
        if (typeof(callback) != "function") return

        if (!sessions.has(data.session_code)) {
            callback({
                status: "session not found",
                invalidSession: true,
                left: false
            });
            return
        }

        socket.broadcast.to(data.session_code).emit("removePlayer", {
            player: socket.id
        })

        socket.leave(data.session_code)

        callback({
            left: true
        })

        console.log("Session", data.session_code, "left by", socket.id)
    })

    socket.on('loadMap', (data) => {
        if (!sessions.has(data.session_code)) 
            return

        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            socket.broadcast.to(data.session_code).emit("loadMap", {
                url: data.url
            })
            session.url = data.url;

            console.log("Session", data.session_code, "loaded map", data.url)
        }
    })

    socket.on("transferDm", (data) => {
        let session = sessions.get(data.session_code)

        let socket = io.sockets.sockets.get(data.player)

        session.dm = socket.id
        session.dmSocket = socket

        console.log("Made", session.dm, "DM of", data.session_code)

        socket.emit("assignDm")

        socket.broadcast.to(data.session_code).emit("syncPlayerData")
    })

    socket.on("syncPlayerData", (data) => {
        socket.broadcast.to(data.session_code).emit("addPlayer", {
            player: socket.id,
            playerName: data.playerName,
            initiative: data.initiative,
            initiativeModifier: data.initiativeModifier
        })
    })

    socket.on("updateInitiative", (data) => {
        let session = sessions.get(data.session_code)

        if (socket.id == session.dm || socket.id == data.player) {
            socket.broadcast.to(data.session_code).emit("updateInitiative", { player: data.player, initiative: data.initiative })
        }
    })

    socket.on("updateInitiativeModifier", (data) => {
        let session = sessions.get(data.session_code)

        if (socket.id == session.dm || socket.id == data.player) {
            socket.broadcast.to(data.session_code).emit("updateInitiativeModifier", { player: data.player, initiativeModifier: data.initiativeModifier })
        }
    })

    socket.on("addDummy", (data) => {
        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            socket.broadcast.to(data.session_code).emit("addPlayer", { player: data.dummyId, playerName: data.name, initiativeModifier: data.initiativeModifier, isDummy: true })
        }
    })

    socket.on("removeDummy", (data) => {
        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            socket.broadcast.to(data.session_code).emit("removePlayer", { player: data.player })
        }
    })
});

io.of("/").adapter.on("leave-room", async (room, id) => {
    let session = sessions.get(room)

    if (!session) return

    let sockets = await io.in(room).fetchSockets();

    if (id == session.dm) {
        session.dm = undefined;
        session.dmSocket = undefined;

        console.log("DM left session", room)

        if (sockets.length > 0) {
            sockets[0].emit("assignDm")
            session.dm = sockets[0].id
            session.dmSocket = sockets[0]

            console.log("Made", session.dm, "DM of", room)

            sockets[0].broadcast.to(room).emit("syncPlayerData")
        }
    }

    sockets.forEach(
        (socket) => socket.emit("removePlayer", {
            player: id
        })
    )

    console.log("Player left session", room)
    
    console.log(sockets.length, "users remaining in session")

    if (sockets.length == 0) {
        sessions.delete(room)

        console.log("Deleting empty session", room)
    }
})

server.listen(4134);
console.log("Listening on Port 4134");
