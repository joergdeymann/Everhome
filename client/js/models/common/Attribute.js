export class Attribute {

constructor(max, value = max, low = 0) {

    this.baseValue = value;
    this.baseMaxValue = max;

    this.modifiedValue = value;
    this.modifiedMaxValue = max;

    this.value = value;
    this.max = max;

    this.low = low;

    this.effectInstances = [];
    this.onLow = null;
    this.isLow = false;
}

    add(effect, networkId) {

        const instance =
            effect.createInstance(networkId);

        this.effectInstances.push(instance);

        return instance;
    }


    remove(instance) {

        const index =
            this.effectInstances.indexOf(instance);

        if (index !== -1) {
            this.effectInstances.splice(index, 1);
        }
    }


 update(now) {

    for (const instance of this.effectInstances) {

        if (!instance.active) {
            continue;
        }

        instance.update(this, now);
    }

    this.#checkLow();
}

    start() {

        for (const effectInstance of this.effectInstances) {
            effectInstance.start();
        }
    }


    stop() {

        for (const effectInstance of this.effectInstances) {
            effectInstance.stop();
        }
    }


    #recalculateValue() {

        this.modifiedValue = this.baseValue;
        this.modifiedMaxValue = this.baseMaxValue;

        this.value = this.modifiedValue;
        this.max = this.modifiedMaxValue;

        this.#applyLimits();
    }


    #calculateModifierValue(value, baseChange) {

        for (const instance of this.effectInstances) {

            if (!instance.active) {
                continue;
            }

            const effect = instance.effect;

            if (effect.baseChange !== baseChange) {
                continue;
            }

            value =
                this.#applyModifier(
                    value,
                    effect
                );
        }

        return value;
    }


    #applyModifier(value, effect) {

        if (effect.isPercent) {

            return value +
                value * (effect.amount / 100);
        }

        return value + effect.amount;
    }


    #applyLimits() {

        if (this.value > this.max) {
            this.value = this.max;
        }

        if (this.value < 0) {
            this.value = 0;
        }
    }


    #checkLow() {

        if (this.value < this.low) {

            if (!this.isLow) {

                this.isLow = true;
                this.onLow?.(this);
            }

        } else {

            this.isLow = false;
        }
    }
}