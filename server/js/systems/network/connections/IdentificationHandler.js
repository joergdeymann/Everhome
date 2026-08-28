export class IdentificationHandler {

    constructor(playerManager) {

        this.playerManager =
            playerManager;
    }


    handle(socket, message) {

        let player = null;


        if (message.playerId !== null) {

            player =
                this.playerManager.getPlayer(
                    message.playerId
                );
        }


        if (!player) {

            player =
                this.playerManager.createPlayer();

            console.log(
                "NEUER SPIELER:",
                player.id
            );

        } else {

            console.log(
                "SPIELER WIEDERERKANNT:",
                player.id
            );
        }


        // Noch kein echtes Rechte-/Login-System - bis dahin
        // kann sich eine Test-Session per Identify-Nachricht
        // selbst als Admin markieren (ausschließlich zum
        // Ausprobieren des Admin-Chats/der Kennzeichnung,
        // NICHT für den produktiven Einsatz gedacht).
        if (message.isAdmin === true) {
            player.isAdmin = true;
        }


        this.playerManager.connectPlayer(
            player,
            socket
        );


        console.log(
            "SPIELER VERBUNDEN:",
            player.id
        );


        socket.send(
            JSON.stringify({
                type: "identified",
                playerId: player.id,
                name: player.name,
                species: player.animal.name,
                isAdmin: player.isAdmin
            })
        );


        // Snapshot aller aktuell verbundenen Spieler,
        // damit der Neuankömmling sofort alle Boxen
        // befüllen kann (nicht erst beim nächsten Tick).
        const players = [];

        for (const p of this.playerManager.players.values()) {

            if (!p.connected) {
                continue;
            }

            players.push(
                this.#playerSnapshot(p)
            );
        }

        socket.send(
            JSON.stringify({
                type: "playerList",
                players
            })
        );


        // Alle anderen informieren, dass ein neuer
        // Spieler da ist.
        this.playerManager.broadcast(
            {
                type: "playerJoined",
                ...this.#playerSnapshot(player)
            },
            player.id
        );


        return player;
    }


    #playerSnapshot(player) {

        return {
            playerId: player.id,
            name: player.name,
            species: player.animal.name,
            isAdmin: player.isAdmin,
            health: {
                value: player.attributes.health.value,
                max: player.attributes.health.max
            },
            strength: {
                value: player.attributes.strength.value,
                max: player.attributes.strength.max
            }
        };
    }
}
