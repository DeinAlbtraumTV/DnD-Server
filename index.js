const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

let sessions = new Map()

class GameSession {
    constructor (code) {
        this.session_code = code;
    }

    static generateID() {
        let code = Math.random().toString(36).substr(2, 9)

        sessions.forEach(session => {
            if (session.session_code === code) {
                return this.generateID()
            }
        });

        return code
    };
}

io.on('connection', (socket) => {

    socket.on("startupSync", (data, callback) => {
        if (typeof(callback) != "function") return

        let session_exists = sessions.has(data.session_code)

        if (session_exists) {
            let session = sessions.get(data.session_code)

            socket.join(data.session_code)

            callback({
                hasDm: (session.dm != "" && session.dm != undefined),
                url: session.url ?? "",
                tokens: session.tokens ?? [],
                session_exists: true
            })

            return
        }

        callback({
            session_exists: false
        })
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

            return
        }

        callback({
            session_exists: false
        })
    })

    socket.on("createSession", (callback) => {
        if (typeof(callback) != "function") return

        let code = GameSession.generateID()

        sessions.set(
            code,
            new GameSession(code)
        )

        if (socket.rooms.size > 1) {
            var rooms = io.sockets.adapter.sids[socket.id];
            for(var room in rooms) {
                socket.leave(room);
            }
        }

        socket.join(code)

        callback({
            session_code: code
        })
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

        if (socket.rooms.size > 1) {
            var rooms = io.sockets.adapter.sids[socket.id];
            for(var room in rooms) {
                socket.leave(room);
            }
        }

        socket.join(data.session_code)

        callback({
            joined: true
        })
    })

    socket.on('login', (data, callback) => {
        if (typeof(callback) != "function") return

        if (!sessions.has(data.session_code)) {
            callback({
                loggedIn: false,
                status: "session not found",
                invalidSession: true
            });
            return
        }

        let session = sessions.get(data.session_code)

        if (session.dm == "" || session.dm == undefined) {
            session.dm = socket.id
            session.dmSocket = socket

            callback({
                loggedIn: true,
                tokens: session.tokens ?? [],
                status: "ok"
            })

            io.to(data.session_code).emit("dmAssigned");
        } else {
            callback({
                loggedIn: false,
                status: "dm already assigned",
                invalidSession: false
            });
        }
    })

    socket.on('loadOwlbear', (data) => {
        if (!sessions.has(data.session_code)) 
            return

        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            io.to(data.session_code).emit("loadOwlbear", {
                url: data.url
            })
            session.url = data.url;
        }
    })

    socket.on("getPlayerSheets", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            io.to(data.player).to(session.session_code).emit("getPlayerSheets")
        }
    })

    socket.on("sendPlayerSheets", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (session.dm != "" && socket.id != session.dm && session.dmSocket != undefined) {
            session.dmSocket.emit("sendPlayerSheets", data)
        }
    })

    socket.on("loadPlayerData", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (session.dm != "" && socket.id != session.dm && session.dmSocket != undefined) {
            session.dmSocket.emit("newPlayer", {
                player: socket.id,
                playerName: data.playerName,
                hpNow: data.hpNow,
                hpMax: data.hpMax,
            })
        }
    })

    socket.on("syncTokens", (data) => {
        if (!sessions.has(data.session_code) || data.tokens === undefined || data.tokens === null)
            return

        let session = sessions.get(data.session_code)

        if (socket.id == session.dm) {
            session.tokens = data.tokens
            socket.broadcast.emit("renderTokens", {tokens: data.tokens})
        }
    })


    socket.on("updateCharacterSheet", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (session.dm != "" && socket.id != session.dm && session.dmSocket != undefined) {
            switch (data.type) {
                case "text":
                    session.dmSocket.emit("updateCharacterSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        value: data.value,
                    })
                    break
                case "checkbox":
                    session.dmSocket.emit("updateCharacterSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        checked: data.checked,
                    })
                    break
            }
        }
    })

    socket.on("updateDetailsSheet", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (session.dm != "" && socket.id != session.dm && session.dmSocket != undefined) {
            switch (data.type) {
                case "text":
                    session.dmSocket.emit("updateDetailsSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        value: data.value,
                    })
                    break
                case "checkbox":
                    session.dmSocket.emit("updateDetailsSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        checked: data.checked,
                    })
                    break
            }
        }
    })

    socket.on("updateSpellcastingSheet", (data) => {
        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (session.dm != "" && socket.id != session.dm && session.dmSocket != undefined) {
            switch (data.type) {
                case "text":
                    session.dmSocket.emit("updateSpellcastingSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        value: data.value,
                    })
                    break
                case "checkbox":
                    session.dmSocket.emit("updateSpellcastingSheet", {
                        player: socket.id,
                        elementID: data.elementID,
                        type: data.type,
                        checked: data.checked,
                    })
                    break
            }
        }
    })

    socket.on("updatePlayerHP", (data) => {
        let real_player = data.player

        data.player = "You"
        socket.emit("updatePlayerHP", data)

        data.player = real_player

        if (!sessions.has(data.session_code))
            return

        let session = sessions.get(data.session_code)

        if (socket.id != session.dm && session.dm != "" && session.dmSocket != null) {
            session.dmSocket.emit("updatePlayerHP", {
                player: socket.id,
                hpNow: data.hpNow,
                hpMax: data.hpMax
            })
        }
    })

    socket.on('disconnecting', () => {
        if (socket.rooms.size == 1) {
            return
        }

        let rooms = socket.rooms.values()

        rooms.next()

        let session_code = rooms.next().value

        if (!sessions.has(session_code))
            return

        let session = sessions.get(session_code)

        if (socket.id == session.dm) {
            session.dm = undefined;
            session.dmSocket = undefined;
            session.url = undefined;

            io.to(session_code).emit("dmRemoved");

            console.log("DM Left for Session " + session.session_code)
        } else {
            if (session.dm != "" && session.dm != undefined) {
                session.dmSocket.emit("playerDisconnected", {
                    player: socket.id
                })
            }
        }
    })
});

server.listen(4134);
console.log("Listening on Port 4134");
