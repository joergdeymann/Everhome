import { Player } from "../models/player/Player.js";
import { Animal } from "../models/common/Animal.js";

export class PlayerManager {

    constructor() {

        this.players = new Map();

        this.nextPlayerId = 1;
    }


    // Noch keine echte Charaktererstellung/Speicherung -
    // bis dahin reihum eine Spezies zum Testen der
    // klassen-eingefärbten Namen im Chat vergeben.
    static #speciesRotation = ["Hund", "Katze", "Schildkröte"];

    createPlayer() {

        const id =
            this.nextPlayerId++;

        const species =
            PlayerManager.#speciesRotation[
                (id - 1) % PlayerManager.#speciesRotation.length
            ];

        const animal =
            new Animal(species);


        const player =
            new Player(
                id,
                `Player ${id}`,
                animal
            );


        player.socket = null;
        player.connected = false;
        player.connectedAt = null;
        player.disconnectedAt = null;


        this.players.set(
            player.id,
            player
        );


        return player;
    }


    getPlayer(id) {
        return this.players.get(id);
    }


    connectPlayer(player, socket, now = Date.now()) {

        player.socket = socket;

        player.connected = true;

        player.connectedAt = now;

        player.disconnectedAt = null;
    }


    disconnectPlayer(player, now = Date.now()) {

        player.socket = null;

        player.connected = false;

        player.disconnectedAt = now;
    }


    isConnected(player) {

        return player.connected;
    }


    // Sendet eine Nachricht an alle verbundenen Spieler.
    // excludePlayerId optional, um den Absender selbst
    // auszunehmen.
    broadcast(message, excludePlayerId = null) {

        const json =
            JSON.stringify(message);

        for (const player of this.players.values()) {

            if (player.id === excludePlayerId) {
                continue;
            }

            if (!player.connected || !player.socket) {
                continue;
            }

            player.socket.send(json);
        }
    }
}