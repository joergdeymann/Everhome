import { Effect } from "./Effect.js";

export class EffectInstance {

    constructor(effect) {

        this.effect = effect;

        this.active = false;

        this.startedAt = null;
        this.finishedAt = null;

        this.currentTick = 0;

        this.lastTickStartedAt = null;
        this.nextTickAt = null;

        this.executions = 0;
    }


    start(now = performance.now()) {
console.log(
    "EFFECT START:",
    this.effect.id
);
        if (this.active) {
            return false;
        }

        if (
            this.finishedAt !== null &&
            this.effect.cooldown !== null &&
            now < this.finishedAt + this.effect.cooldown
        ) {
            return false;
        }

        this.active = true;

        this.startedAt = now;
        this.finishedAt = null;

        this.currentTick = 0;

        this.lastTickStartedAt = null;

        this.nextTickAt =
            now + this.effect.delay;

        this.executions = 0;

        return true;
    }


    stop(now = performance.now()) {

        if (!this.active) {
            return false;
        }

        this.finish(now);

        return true;
    }


    update(attribute, now) {
console.log(
    "EFFECT UPDATE ERREICHT:",
    this.effect.id,
    "active:",
    this.active,
    "now:",
    now
);
        if (!this.active) {
            return false;
        }

        // Gesamtdauer des Effekts überwachen
        if (
            this.effect.duration !== null &&
            now >= this.startedAt + this.effect.duration
        ) {
            this.finish(now);
            return false;
        }
console.log(
    "TICKS:",
    this.effect.id,
    this.effect.ticks
);
        // Kein Tick vorhanden
        if (
            !this.effect.ticks ||
            this.effect.ticks.length === 0
        ) {
            return false;
        }

console.log(
    "TICK PRÜFUNG:",
    this.effect.id,
    "now:",
    now,
    "nextTickAt:",
    this.nextTickAt
);
        // Noch kein Tick fällig
        if (now < this.nextTickAt) {
            return false;
        }

console.log(
    "TICK WIRD AUSGEFÜHRT:",
    this.effect.id
);        this.execute(attribute, now);

        return true;
    }


    execute(attribute, now) {

        if (!this.active) {
            return false;
        }

        const tick =
            this.effect.ticks[this.currentTick];

        if (!tick) {
            this.finish(now);
            return false;
        }

        console.log(
            "TICK FÄLLIG:",
            this.effect.id,
            "tick:",
            this.currentTick,
            "value vorher:",
            attribute.value
        );

        // Wirkung ausführen
        this.applyTick(attribute, tick);

        this.executions++;

        // Anzahl der Ausführungen dieses Ticks prüfen
        if (
            tick.count !== null &&
            this.executions >= tick.count
        ) {

            this.currentTick++;
            this.executions = 0;

            // Keine weiteren Ticks
            if (
                this.currentTick >=
                this.effect.ticks.length
            ) {
                this.finish(now);
                return true;
            }
        }

        const nextTick =
            this.effect.ticks[this.currentTick];

        this.lastTickStartedAt = now;

        this.nextTickAt =
            now +
            (
                nextTick
                    ? nextTick.cooldown
                    : tick.cooldown
            );

        return true;
    }

    applyTick(attribute, tick) {

        // --------------------------------------------------
        // Maximales Leben verändern
        // --------------------------------------------------

        if (tick.maxChange !== 0) {

            const ratio =
                attribute.max === 0
                    ? 0
                    : attribute.value / attribute.max;

            let maxAmount = tick.maxChange;

            if (this.effect.isPercent) {

                maxAmount =
                    attribute.max *
                    (maxAmount / 100);
            }

            attribute.max += maxAmount;

            attribute.value =
                attribute.max * ratio;
        }


        // --------------------------------------------------
        // Momentanes Leben verändern
        // --------------------------------------------------

        if (tick.valueChange !== 0) {

            let amount = tick.valueChange;

            if (this.effect.isPercent) {

                amount =
                    attribute.value *
                    (amount / 100);
            }

            attribute.value += amount;
        }


        // --------------------------------------------------
        // Grenzen
        // --------------------------------------------------

        if (attribute.value > attribute.max) {
            attribute.value = attribute.max;
        }

        if (attribute.value < 0) {
            attribute.value = 0;
        }
    }

    // applyTick(attribute, tick) {

    //     if (tick.valueChange === 0) {
    //         return;
    //     }

    //     let amount = tick.valueChange;

    //     if (this.effect.isPercent) {

    //         amount =
    //             attribute.value *
    //             (amount / 100);
    //     }

    //     attribute.value += amount;

    //     // Grenzen
    //     if (attribute.value > attribute.max) {
    //         attribute.value = attribute.max;
    //     }

    //     if (attribute.value < 0) {
    //         attribute.value = 0;
    //     }
    // }


    finish(now) {

        this.active = false;

        this.finishedAt = now;

        this.nextTickAt = null;
        this.lastTickStartedAt = null;

        this.currentTick = 0;
        this.executions = 0;
    }
}