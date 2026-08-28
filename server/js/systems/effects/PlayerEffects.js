export class PlayerEffects {

    constructor() {

        this.instances = new Map();
    }


    add(instance) {

        this.instances.set(
            instance.networkId,
            instance
        );

        return instance;
    }


    get(networkId) {

        return this.instances.get(
            networkId
        );
    }


    remove(networkId) {

        return this.instances.delete(
            networkId
        );
    }


    getAll() {

        return this.instances.values();
    }

    // Gibt { tickedEffects, finishedInstanceIds } zurück:
    // - tickedEffects: { attribute, effectId } für alle Effekte,
    //   die in diesem Tick tatsächlich gewirkt haben.
    // - finishedInstanceIds: networkId aller Instanzen, die in
    //   diesem Tick (oder schon vorher, aber noch nicht
    //   gemeldet) beendet wurden -> der Aufrufer kann darüber
    //   allen Clients per "effectRemoved" Bescheid geben, auch
    //   wenn die Instanz von SELBST fertig geworden ist (Ticks/
    //   Dauer abgelaufen) und nicht per Klick entfernt wurde.
    update(attributes, now) {

        const tickedEffects = [];
        const finishedInstanceIds = [];

        for (const [networkId, instance] of this.instances.entries()) {

            if (!instance.active) {

                // Effekt ist fertig -> verschwindet wieder.
                this.instances.delete(networkId);
                finishedInstanceIds.push(networkId);

                continue;
            }

            const attribute =
                attributes[instance.effect.attribute];

            if (!attribute) {

                console.log(
                    "UNBEKANNTES ZIEL-ATTRIBUT:",
                    instance.effect.attribute
                );

                continue;
            }

            const result =
                instance.update(
                    attribute,
                    now
                );

            if (result.ticked) {

                tickedEffects.push({
                    attribute: instance.effect.attribute,
                    effectId: instance.effect.id,
                    instanceId: instance.networkId,
                    valueAmount: result.valueAmount,
                    maxAmount: result.maxAmount
                });
            }

            if (!instance.active) {

                // Ist während dieses Ticks fertig geworden
                // -> sofort verschwinden und melden.
                this.instances.delete(networkId);
                finishedInstanceIds.push(networkId);
            }
        }

        return { tickedEffects, finishedInstanceIds };
    }

}