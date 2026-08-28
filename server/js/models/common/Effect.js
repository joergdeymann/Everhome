import { EffectInstance } from "./EffectInstance.js";

export class Effect {

    constructor(
        networkId,
        id,

        attribute = "health",

        priority = 0,
        isPercent = false,
        baseChange = false,

        delay = 0,
        duration = null,
        cooldown = 0,

        instances = 1,

        // Wie viele gleichzeitig aktive Instanzen dieses
        // Effekts derselbe AUSLÖSER (Caster) haben darf,
        // unabhängig vom Ziel. null = unbegrenzt.
        sourceInstances = null,

        // Wie viele gleichzeitig aktive Instanzen dieses
        // Effekts dasselbe ZIEL haben darf, unabhängig
        // vom Auslöser. null = unbegrenzt.
        targetInstances = null,

        // Für-immer-Sperre, unabhängig von aktiven Instanzen:
        // Auslöser darf diesen Effekt insgesamt nur EINMAL
        // jemals wirken (auch nach Ablauf nie wieder).
        sourceOnce = false,

        // Für-immer-Sperre: Ziel darf diesen Effekt insgesamt
        // nur EINMAL jemals erhalten (auch nach Ablauf nie
        // wieder).
        targetOnce = false,

        ticks = []
    ) {

        this.networkId = networkId;
        this.id = id;

        // Name des Attributs (health, strength, ...),
        // auf das dieser Effekt wirkt. Siehe Attributes.js
        // für die verfügbaren Namen.
        this.attribute = attribute;

        this.priority = priority;
        this.isPercent = isPercent;
        this.baseChange = baseChange;

        this.delay = delay;
        this.duration = duration;
        this.cooldown = cooldown;

        this.instances = instances;

        this.sourceInstances = sourceInstances;
        this.targetInstances = targetInstances;

        this.sourceOnce = sourceOnce;
        this.targetOnce = targetOnce;

        this.ticks = ticks;
    }


    createInstance(networkId) {

        return new EffectInstance(
            networkId,
            this
        );
    }
}