import { IdentificationHandler }
    from "../systems/network/connections/IdentificationHandler.js";

import { EffectActionHandler }
    from "../systems/network/actions/EffectActionHandler.js";

import { SystemMessageHandler }
    from "../systems/network/messages/SystemMessageHandler.js";

import { ChatMessageHandler }
    from "../systems/network/messages/ChatMessageHandler.js";

import { GroupManager }
    from "./GroupManager.js";

import { EffectLoader }
    from "../systems/effects/EffectLoader.js";


// --------------------------------------------------
// Kategorisierung der Nachrichtentypen
// --------------------------------------------------

const CONNECTION_TYPES = new Set([
    "identify"
]);

const ACTION_TYPES = new Set([
    "effect",
    "removeEffect",
    "joinGroup",
    "leaveGroup"
    // hier künftig weitere Spielanweisungen eintragen,
    // z.B. "move", "useItem", ...
]);

const SYSTEM_TYPES = new Set([
    "ping",
    "reloadEffects",
    "whoami"
    // hier künftig weitere Systemnachrichten eintragen
]);


export class ConnectionManager {

    constructor(
        webSocketServer,
        playerManager,
        effectManager,
        effectFilePath
    ) {

        this.webSocketServer =
            webSocketServer;

        this.playerManager =
            playerManager;

        this.effectManager =
            effectManager;

        // Für den Hot-Reload (Client kann "reloadEffects"
        // schicken, z.B. nachdem die JSON-Datei von Hand
        // geändert wurde, ohne den Server neu starten zu
        // müssen).
        this.effectFilePath =
            effectFilePath;

        this.identificationHandler =
            new IdentificationHandler(
                playerManager
            );

        this.effectActionHandler =
            new EffectActionHandler(
                playerManager,
                effectManager
            );

        this.systemMessageHandler =
            new SystemMessageHandler(
                playerManager
            );

        this.chatMessageHandler =
            new ChatMessageHandler(
                playerManager,
                new GroupManager()
            );
    }


    start() {

        this.webSocketServer.on(
            "connection",
            (socket) => {

                this.handleConnection(
                    socket
                );

            }
        );
    }


    handleConnection(socket) {

        console.log(
            "WebSocket Verbindung hergestellt"
        );

        let player = null;


        socket.on(
            "message",
            (data) => {

                const message =
                    JSON.parse(data);

                console.log(
                    "CLIENT NACHRICHT:",
                    message
                );


                // --------------------------------------------------
                // Verbindungsanfrage
                // --------------------------------------------------

                if (CONNECTION_TYPES.has(message.type)) {

                    player =
                        this.identificationHandler.handle(
                            socket,
                            message
                        );

                    // Katalog nur übertragen, wenn er sich
                    // seit der letzten Version des Clients
                    // geändert hat.
                    const currentVersion =
                        this.effectManager.getCatalogVersion();

                    if (message.catalogVersion === currentVersion) {

                        socket.send(
                            JSON.stringify({
                                type: "effectCatalogUnchanged",
                                version: currentVersion
                            })
                        );

                    } else {

                        socket.send(
                            JSON.stringify({
                                type: "effectCatalog",
                                version: currentVersion,
                                effects: this.effectManager.getCatalog()
                            })
                        );
                    }

                    return;
                }


                // Ab hier muss der Spieler identifiziert sein.

                if (!player) {

                    console.log(
                        "NACHRICHT VOR IDENTIFIZIERUNG IGNORIERT"
                    );

                    return;
                }


                // --------------------------------------------------
                // Spielanweisung (Effekt)
                // --------------------------------------------------

                if (ACTION_TYPES.has(message.type)) {

                    if (message.type === "removeEffect") {

                        this.effectActionHandler.handleRemove(
                            player,
                            message
                        );

                    } else if (message.type === "joinGroup") {

                        this.chatMessageHandler.handleJoin(
                            player,
                            message
                        );

                    } else if (message.type === "leaveGroup") {

                        this.chatMessageHandler.handleLeave(
                            player,
                            message
                        );

                    } else {

                        this.effectActionHandler.handle(
                            player,
                            message
                        );
                    }

                    return;
                }


                // --------------------------------------------------
                // Systemnachricht
                // --------------------------------------------------

                if (SYSTEM_TYPES.has(message.type)) {

                    if (message.type === "reloadEffects") {

                        this.#reloadEffects(player);

                    } else if (message.type === "whoami") {

                        this.#whoami(player);

                    } else {

                        this.systemMessageHandler.handle(
                            player,
                            message
                        );
                    }

                    return;
                }


                // --------------------------------------------------
                // Alles andere: Chat-Nachricht
                // --------------------------------------------------

                this.chatMessageHandler.handle(
                    player,
                    message
                );
            }
        );


        socket.on(
            "close",
            () => {

                console.log(
                    "WebSocket Verbindung beendet"
                );

                if (player) {

                    this.playerManager
                        .disconnectPlayer(
                            player
                        );

                    this.chatMessageHandler.groupManager.leaveAll(
                        player.id
                    );

                    this.playerManager.broadcast({
                        type: "playerLeft",
                        playerId: player.id
                    });
                }
            }
        );
    }


    // Effekt-Daten (JSON) zur Laufzeit neu einlesen, ohne den
    // Server neu starten zu müssen - z.B. nachdem "sample_effects.json"
    // von Hand geändert wurde. Der neue Katalog geht danach an
    // ALLE verbundenen Clients raus (wie beim ersten Connect).
    // Serverseitige Antwort auf ":whoami" - schickt dem
    // fragenden Spieler seine eigenen, vom Server bestätigten
    // Identitätsdaten zurück (nützlich z.B. nach Reconnect,
    // um sicherzugehen, mit wem man gerade verbunden ist).
    #whoami(player) {

        if (!player?.socket) {
            return;
        }

        player.socket.send(
            JSON.stringify({
                type: "whoamiResult",
                playerId: player.id,
                name: player.name,
                species: player.animal.name,
                isAdmin: player.isAdmin
            })
        );
    }


    #reloadEffects(player) {

        try {

            this.effectManager.clearEffects();

            EffectLoader.load(
                this.effectFilePath,
                this.effectManager
            );

            const version =
                this.effectManager.getCatalogVersion();

            this.playerManager.broadcast({
                type: "effectCatalog",
                version,
                effects: this.effectManager.getCatalog()
            });

            console.log(
                "EFFEKT-DATEN NEU GELADEN:",
                this.effectFilePath
            );

        } catch (error) {

            console.log(
                "FEHLER BEIM NEULADEN DER EFFEKT-DATEN:",
                error.message
            );

            if (player?.socket) {

                player.socket.send(
                    JSON.stringify({
                        type: "reloadFailed",
                        error: error.message
                    })
                );
            }
        }
    }
}
