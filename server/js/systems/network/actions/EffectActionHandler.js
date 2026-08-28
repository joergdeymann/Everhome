import { performance } from "perf_hooks";

export class EffectActionHandler {

    constructor(
        playerManager,
        effectManager
    ) {

        this.playerManager =
            playerManager;

        this.effectManager =
            effectManager;
    }


    handle(player, message) {

        if (!Array.isArray(message.id)) {

            console.log(
                "FEHLER: Effect-ID muss eine Liste sein"
            );

            return;
        }


        const targetIds =
            Array.isArray(message.targets)
                ? message.targets
                : (message.target !== undefined
                    ? [message.target]
                    : []);

        if (targetIds.length === 0) {

            console.log(
                "FEHLER: Kein Ziel angegeben"
            );

            return;
        }


        const targets = [];

        for (const targetId of targetIds) {

            const target =
                this.playerManager.getPlayer(
                    targetId
                );

            if (
                target &&
                target.connected &&
                target.socket
            ) {

                targets.push(target);
            }
        }

        if (targets.length === 0) {
            return;
        }


        // Wichtig: gleiche Zeitbasis wie im GameLoop
        // (performance.now(), nicht Date.now()).
        const now =
            performance.now();

        // Ziel-ID -> Liste der auf diesem Ziel neu gestarteten
        // Instanzen, für den Broadcast am Ende (ein "effect"-
        // Broadcast pro betroffenem Ziel, wie bisher).
        const appliedByTarget = new Map();
        const rejected = [];


        for (const networkId of message.id) {

            const effect =
                this.effectManager.getEffect(
                    networkId
                );

            if (!effect) {

                console.log(
                    "FEHLER: Effekt nicht gefunden:",
                    networkId
                );

                continue;
            }


            // --------------------------------------------------
            // Abklingzeit gehört zur AKTION (diesem einen
            // Wirken-Vorgang), nicht zum einzelnen Ziel: ist
            // der Zauber noch auf Abklingzeit, wird die GANZE
            // Aktion für diesen Effekt abgelehnt - auch wenn
            // mehrere Ziele anvisiert waren. Kein Ziel bekommt
            // ihn dann teilweise (löst Fall a).
            // --------------------------------------------------

            if (!player.cooldowns.isReady(effect.id, now)) {

                rejected.push({
                    effectId: effect.id,
                    reason: "cooldown",
                    remaining:
                        player.cooldowns.getRemaining(
                            effect.id,
                            now
                        )
                });

                console.log(
                    "EFFEKT AUF ABKLINGZEIT, GANZE AKTION ABGELEHNT:",
                    effect.id
                );

                continue;
            }


            // Für-immer-Sperre: Auslöser hat diesen Effekt
            // schon mal jemals gewirkt. Gehört ebenfalls zum
            // Auslöser, nicht zum Ziel -> ganze Aktion für
            // diesen Effekt ablehnen.
            if (
                effect.sourceOnce &&
                player.castOnceUsed.has(effect.id)
            ) {

                rejected.push({
                    effectId: effect.id,
                    reason: "sourceOnce"
                });

                console.log(
                    "AUSLÖSER HAT DIESEN EFFEKT SCHON MAL GEWIRKT:",
                    effect.id
                );

                continue;
            }


            // sourceInstances zählt über ALLE Ziele dieser
            // Aktion mit (der Auslöser darf insgesamt nur X
            // gleichzeitig aktive Instanzen haben, unabhängig
            // vom Ziel) - deshalb hier einmal ermitteln und
            // während der Ziel-Schleife hochzählen (löst Fall
            // b: steht es auf "unbegrenzt", bremst nichts).
            let sourceCount =
                effect.sourceInstances !== null
                    ? this.#countActiveInstances(
                        effect.id,
                        (instance) => instance.casterId === player.id
                    )
                    : 0;

            const appliedForEffect = [];


            for (const target of targets) {

                // Für-immer-Sperre: Ziel hat diesen Effekt
                // schon mal jemals erhalten. Ist pro ZIEL zu
                // prüfen, andere Ziele in derselben Aktion
                // trifft das nicht.
                if (
                    effect.targetOnce &&
                    target.receivedOnceUsed.has(effect.id)
                ) {

                    rejected.push({
                        effectId: effect.id,
                        reason: "targetOnce",
                        target: target.id
                    });

                    continue;
                }


                // Wie viele aktive Instanzen dieses Effekts
                // hat dieses ZIEL schon (unabhängig vom
                // Auslöser)? Ebenfalls pro Ziel.
                if (effect.targetInstances !== null) {

                    const targetCount =
                        this.#countActiveInstances(
                            effect.id,
                            (instance) => instance.targetId === target.id
                        );

                    if (targetCount >= effect.targetInstances) {

                        rejected.push({
                            effectId: effect.id,
                            reason: "targetInstances",
                            target: target.id
                        });

                        continue;
                    }
                }


                if (
                    effect.sourceInstances !== null &&
                    sourceCount >= effect.sourceInstances
                ) {

                    rejected.push({
                        effectId: effect.id,
                        reason: "sourceInstances",
                        target: target.id
                    });

                    continue;
                }


                const effectInstance =
                    this.effectManager.createInstance(
                        networkId
                    );

                effectInstance.casterId = player.id;
                effectInstance.targetId = target.id;

                target.effects.add(effectInstance);
                effectInstance.start(now);

                if (effect.sourceInstances !== null) {
                    sourceCount++;
                }

                if (effect.targetOnce) {
                    target.receivedOnceUsed.add(effect.id);
                }

                appliedForEffect.push({
                    target,
                    instance: effectInstance
                });

                console.log(
                    "EFFECT INSTANCE GESTARTET:",
                    effectInstance.networkId,
                    "->",
                    target.id
                );
            }


            if (appliedForEffect.length > 0) {

                // Abklingzeit erst JETZT (einmal, für die
                // ganze Aktion) starten - nicht pro Ziel.
                player.cooldowns.start(
                    effect.id,
                    effect.cooldown,
                    now
                );

                if (effect.sourceOnce) {
                    player.castOnceUsed.add(effect.id);
                }

                for (const { target, instance } of appliedForEffect) {

                    if (!appliedByTarget.has(target.id)) {
                        appliedByTarget.set(target.id, []);
                    }

                    appliedByTarget.get(target.id).push(instance);
                }
            }
        }


        for (const [targetId, instances] of appliedByTarget.entries()) {

            const effectsInfo =
                instances.map((instance) => {

                    return {
                        networkId: instance.effect.networkId,
                        instanceId: instance.networkId,
                        id: instance.effect.id,
                        isPercent: instance.effect.isPercent,
                        duration: instance.effect.duration
                    };
                });

            // Broadcast an alle, damit jeder Client die
            // Effekt-Anzeige (Badge) auf der Box des
            // Ziel-Spielers aktualisieren kann.
            this.playerManager.broadcast({
                type: "effect",
                target: targetId,
                from: player.id,
                effects: effectsInfo
            });
        }


        if (rejected.length > 0 && player.socket) {

            player.socket.send(
                JSON.stringify({
                    type: "effectRejected",
                    effects: rejected
                })
            );
        }
    }


    // Gezieltes Entfernen einer einzelnen laufenden Instanz
    // (z.B. per "Entfernen"-Button im Client). Stoppt nur
    // weitere Ticks - bereits gewirkte Werte bleiben, es
    // wird nichts zurückgerechnet.
    handleRemove(player, message) {

        const target =
            this.playerManager.getPlayer(
                message.target
            );

        if (!target) {
            return;
        }

        const instance =
            target.effects.instances.get(
                message.instanceId
            );

        if (instance && instance.active) {

            instance.stop(
                performance.now()
            );

            target.effects.instances.delete(
                message.instanceId
            );

            console.log(
                "EFFECT INSTANCE ENTFERNT:",
                message.instanceId
            );

        } else {

            // Instanz ist serverseitig bereits fertig (z.B.
            // einmaliger Zauber, der von selbst abgelaufen
            // ist), bevor der Klick ankam. Trotzdem die
            // Entfernung bestätigen, damit die Anzeige beim
            // Client (und der "X"-Button) nicht hängen bleibt.
            console.log(
                "EFFECT INSTANCE BEREITS BEENDET, ANZEIGE WIRD SYNCHRONISIERT:",
                message.instanceId
            );
        }

        this.playerManager.broadcast({
            type: "effectRemoved",
            target: target.id,
            instanceId: message.instanceId
        });
    }


    #countActiveInstances(effectId, predicate) {

        let count = 0;

        for (const p of this.playerManager.players.values()) {

            for (const instance of p.effects.instances.values()) {

                if (
                    instance.active &&
                    instance.effect.id === effectId &&
                    predicate(instance)
                ) {

                    count++;
                }
            }
        }

        return count;
    }
}
