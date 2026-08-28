export class EffectInstance_OLD {

    constructor(effect) {

        this.effect = effect;

        this.active = false;

        this.startedAt = null;
        this.finishedAt = null;

        this.lastTickStartedAt = null;
        this.nextTickAt = null;

        this.executions = 0;
    }


    start(now = performance.now()) {

        if (this.active) {
            return false;
        }

        // Cooldown prüfen
        if (
            this.finishedAt !== null &&
            now < this.finishedAt + this.effect.cooldown
        ) {
            return false;
        }

        this.active = true;

        this.startedAt = now;
        this.finishedAt = null;

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

        if (!this.active) {
            return false;
        }

        // Modifier haben keine Ticks
        if (this.effect.ticks === null) {

            // Trotzdem muss die Gesamtdauer überwacht werden
            if (
                this.effect.duration !== null &&
                now >= this.startedAt + this.effect.duration
            ) {
                this.finish(now);
            }

            return false;
        }


        // Gesamtdauer eines Tick-Effekts
        if (
            this.effect.duration !== null &&
            now >= this.startedAt + this.effect.duration
        ) {
            this.finish(now);
            return false;
        }


        // Noch kein Tick fällig
        if (now < this.nextTickAt) {
            return false;
        }


        console.log(
            "TICK FÄLLIG:",
            this.effect.id,
            "value vorher:",
            attribute.value
        );

        this.execute(attribute, now);

        return true;
    }

    execute(attribute, now) {

console.log(
    "TICK FÄLLIG:",
    this.effect.id,
    "value vorher:",
    attribute.value
);
        if (!this.active) {
            return false;
        }

        this.lastTickStartedAt = now;

        // Tick-Effekt ausführen
        this.applyTick(attribute);

        this.executions++;


        // Maximale Tickzahl erreicht
        if (
            this.effect.ticks !== null &&
            this.executions >= this.effect.ticks
        ) {
            this.finish(now);
            return true;
        }


        // Nächsten Tick planen
        this.nextTickAt =
            this.lastTickStartedAt +
            this.getTickCooldown();

        return true;
    }


applyTick(attribute) {

    const amount = this.effect.amount;

    // --------------------------------------------------
    // 1. Effekt verändert den Basiswert
    // --------------------------------------------------

    if (this.effect.baseChange) {

        if (this.effect.isPercent) {

            attribute.baseValue +=
                attribute.baseValue *
                (amount / 100);

        } else {

            attribute.baseValue += amount;
        }
        attribute.recalculateValue();

    }

    // --------------------------------------------------
    // 2. Effekt verändert nur den aktuellen Wert
    // --------------------------------------------------

    else {

        if (this.effect.isPercent) {

            attribute.value +=
                attribute.value *
                (amount / 100);

        } else {

            attribute.value += amount;
        }
    }


    // --------------------------------------------------
    // 3. Grenzen
    // --------------------------------------------------

    if (attribute.baseValue < 0) {
        attribute.baseValue = 0;
    }

    if (attribute.value < 0) {
        attribute.value = 0;
    }

    if (attribute.value > attribute.max) {
        attribute.value = attribute.max;
    }
}

    getTickCooldown() {

        if (this.effect.tickCooldown !== null) {
            return this.effect.tickCooldown;
        }

        return (
            this.effect.tickDelay +
            this.effect.tickDuration
        );
    }


    finish(now) {

        this.active = false;

        this.finishedAt = now;

        this.nextTickAt = null;
        this.lastTickStartedAt = null;
    }
}