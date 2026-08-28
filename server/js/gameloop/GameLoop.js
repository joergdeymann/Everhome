import { performance } from "perf_hooks";

// Namen aller Attribute, die überwacht und
// bei Änderung an den Spieler gesendet werden.
const ATTRIBUTE_NAMES = [
    "health",
    "stamina",
    "mana",
    "strength",
    "speed",
    "dexterity",
    "intelligence",
    "resistance",
    "perception"
];


export class GameLoop {

    constructor(
        playerManager,
        effectManager,
        tickRate = 10 // Ticks pro Sekunde
    ) {

        this.playerManager =
            playerManager;

        this.effectManager =
            effectManager;

        this.tickIntervalMs =
            1000 / tickRate;

        this.intervalId = null;
    }


    start() {

        if (this.intervalId !== null) {
            return;
        }

        this.intervalId =
            setInterval(
                () => this.tick(),
                this.tickIntervalMs
            );

        console.log(
            "GAMELOOP GESTARTET, TICKRATE:",
            this.tickIntervalMs + "ms"
        );
    }


    stop() {

        if (this.intervalId === null) {
            return;
        }

        clearInterval(this.intervalId);
        this.intervalId = null;
    }


    tick() {

        // Wichtig: performance.now() verwenden,
        // da EffectInstance.start() standardmäßig
        // ebenfalls performance.now() nutzt. Beide
        // Zeitbasen dürfen nicht gemischt werden
        // (Date.now() hat einen anderen Nullpunkt).
        const now =
            performance.now();

        for (const player of this.playerManager.players.values()) {

            if (!player.connected) {
                continue;
            }

            this.#updatePlayer(
                player,
                now
            );
        }

        this.effectManager.cleanup();
    }


    #updatePlayer(player, now) {

        const { tickedEffects, finishedInstanceIds } =
            player.effects.update(
                player.attributes,
                now
            );

        // Effekte, die von selbst zu Ende gegangen sind
        // (Ticks/Dauer abgelaufen, nicht per Klick entfernt),
        // müssen den Clients trotzdem gemeldet werden - sonst
        // bleibt die Anzeige (und der "Entfernen"-Button)
        // hängen, obwohl die Instanz serverseitig längst weg
        // ist.
        for (const instanceId of finishedInstanceIds) {

            this.playerManager.broadcast({
                type: "effectRemoved",
                target: player.id,
                instanceId
            });
        }

        const attributeChanges =
            this.#collectDirtyAttributes(
                player.attributes
            );

        // Info ergänzen, WELCHER Effekt das jeweilige
        // Attribut gerade verändert hat + tatsächlich
        // berechneten Betrag (wichtig bei %-Effekten) an
        // alle Clients für die Anzeige im Aktive-Effekte-
        // Fenster durchreichen.
        for (const tick of tickedEffects) {

            if (attributeChanges[tick.attribute]) {

                if (!attributeChanges[tick.attribute].effects) {
                    attributeChanges[tick.attribute].effects = [];
                }

                if (!attributeChanges[tick.attribute].effects.includes(tick.effectId)) {
                    attributeChanges[tick.attribute].effects.push(tick.effectId);
                }
            }

            this.playerManager.broadcast({
                type: "effectTick",
                target: player.id,
                instanceId: tick.instanceId,
                valueAmount: tick.valueAmount,
                maxAmount: tick.maxAmount
            });
        }


        const cooldownChanges =
            player.cooldowns.collectDirty(
                now
            );


        const hasAttributeChanges =
            Object.keys(attributeChanges).length > 0;

        const hasCooldownChanges =
            Object.keys(cooldownChanges).length > 0;


        if (hasAttributeChanges) {

            // Attribute sind für alle sichtbar (Leben/
            // Stärke anderer Spieler in ihrer Box).
            this.playerManager.broadcast({
                type: "state",
                playerId: player.id,
                attributes: attributeChanges
            });

            this.#clearDirty(player.attributes);
        }


        if (hasCooldownChanges && player.socket) {

            // Cooldowns sind privat, gehen nur an den
            // betroffenen Spieler selbst.
            player.socket.send(
                JSON.stringify({
                    type: "state",
                    playerId: player.id,
                    cooldowns: cooldownChanges
                })
            );
        }
    }


    #collectDirtyAttributes(attributes) {

        const changes = {};

        for (const name of ATTRIBUTE_NAMES) {

            const attribute =
                attributes[name];

            if (!attribute || !attribute.isDirty()) {
                continue;
            }

            changes[name] = {
                value: attribute.value,
                max: attribute.max
            };
        }

        return changes;
    }


    #clearDirty(attributes) {

        for (const name of ATTRIBUTE_NAMES) {

            attributes[name]?.clearDirty();
        }
    }
}
