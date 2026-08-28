import { EffectInstance } from "./EffectInstance.js";

export class Effect {

    constructor(
        networkId,
        id,

        priority = 0,
        isPercent = false,
        baseChange = false,

        delay = 0,
        duration = null,
        cooldown = 0,

        instances = 1,

        ticks = []
    ) {

        this.networkId = networkId;
        this.id = id;

        this.priority = priority;
        this.isPercent = isPercent;
        this.baseChange = baseChange;

        this.delay = delay;
        this.duration = duration;
        this.cooldown = cooldown;

        this.instances = instances;

        this.ticks = ticks;
    }


    createInstance(networkId) {

        return new EffectInstance(
            networkId,
            this
        );
    }
}