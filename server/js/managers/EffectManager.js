import { createHash } from "crypto";

export class EffectManager {

    constructor() {

        this.effects = new Map();

        this.effectInstances = new Map();

        this.nextEffectInstanceNetworkId = 1;

        this.#catalogVersion = null;
    }


    registerEffect(effect) {

        this.effects.set(
            effect.networkId,
            effect
        );

        // Katalog hat sich geändert -> Version neu berechnen
        // lassen (lazy, beim nächsten getCatalogVersion()-Aufruf).
        this.#catalogVersion = null;
    }


    // Für Hot-Reload: alle registrierten Effekt-Definitionen
    // verwerfen, bevor sie neu aus der Datei geladen werden.
    // Bereits laufende Instanzen (this.effectInstances) bleiben
    // unberührt - sie halten weiter eine direkte Referenz auf
    // ihr (altes) Effect-Objekt und laufen normal zu Ende.
    clearEffects() {

        this.effects.clear();
        this.#catalogVersion = null;
    }


    getEffect(networkId) {

        return this.effects.get(
            networkId
        );
    }


    // Liste aller registrierten Effekte (Katalog),
    // vollständig, für die Anzeige im Client.
    getCatalog() {

        const catalog = [];

        for (const effect of this.effects.values()) {

            catalog.push({
                networkId: effect.networkId,
                id: effect.id,
                attribute: effect.attribute,
                isPercent: effect.isPercent,
                delay: effect.delay,
                duration: effect.duration,
                cooldown: effect.cooldown,
                sourceInstances: effect.sourceInstances,
                targetInstances: effect.targetInstances,
                sourceOnce: effect.sourceOnce,
                targetOnce: effect.targetOnce,
                ticks: effect.ticks
            });
        }

        return catalog;
    }


    #catalogVersion;

    // Hash über den aktuellen Katalog-Inhalt. Ändert sich
    // nur, wenn sich die Effekt-Daten tatsächlich ändern ->
    // Client kann so erkennen, ob er den Katalog schon hat.
    getCatalogVersion() {

        if (this.#catalogVersion === null) {

            this.#catalogVersion =
                createHash("sha1")
                    .update(JSON.stringify(this.getCatalog()))
                    .digest("hex");
        }

        return this.#catalogVersion;
    }


    createInstance(networkId) {

        const effect =
            this.getEffect(networkId);


        if (!effect) {

            throw new Error(
                `Effect mit networkId ${networkId} nicht gefunden.`
            );
        }


        const effectInstanceNetworkId =
            this.nextEffectInstanceNetworkId++;


        const effectInstance =
            effect.createInstance(
                effectInstanceNetworkId
            );


        this.effectInstances.set(
            effectInstanceNetworkId,
            effectInstance
        );


        return effectInstance;
    }


    getEffectInstance(networkId) {

        return this.effectInstances.get(
            networkId
        );
    }


    // Entfernt fertige (inaktive) Effect-Instanzen aus der
    // globalen Verwaltung, damit die Map nicht unbegrenzt
    // weiterwächst.
    cleanup() {

        for (
            const [networkId, instance]
            of this.effectInstances.entries()
        ) {

            if (!instance.active) {

                this.effectInstances.delete(
                    networkId
                );
            }
        }
    }
}