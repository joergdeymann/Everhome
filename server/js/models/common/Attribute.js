export class Attribute {
    #value;
    #max;

    constructor(max, value = max, low = 0) {

        // --------------------------------------------------
        // Basiswerte
        // --------------------------------------------------

        this.baseValue = value;
        this.baseMaxValue = max;


        // --------------------------------------------------
        // Berechnete Werte
        // --------------------------------------------------

        this.modifiedValue = value;
        this.modifiedMaxValue = max;

        this.#value = value;
        this.#max = max;


        // --------------------------------------------------
        // Zustände
        // --------------------------------------------------

        this.low = low;

        this.effectInstances = [];

        this.onLow = null;
        this.isLow = false;


        // --------------------------------------------------
        // Änderungsflags
        // --------------------------------------------------

        this.valueDirty = false;
        this.maxDirty = false;
    }


    // ======================================================
    // Getter und Setter
    // ======================================================
    get value() {
        return this.#value;
    }

    get max() {
        return this.#max;
    }    

    setValue(value) {
  console.log(
        "SET VALUE:",
        this.#value,
        "->",
        value
    );

        if (this.#value === value) {
            return false;
        }

        this.#value = value;
        this.valueDirty = true;

        return true;
    }

    setMax(max) {
  console.log(
        "SET MAX:",
        this.#max,
        "->",
        max
    );
            if (this.#max === max) {
            return false;
        }

        this.#max = max;
        this.maxDirty = true;

        return true;
    }

    // ======================================================
    // PUBLIC
    // ======================================================

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

            instance.update(
                this,
                now
            );
        }

        this.#checkLow();
    }


    start() {

        for (
            const effectInstance
            of this.effectInstances
        ) {

            effectInstance.start();
        }
    }


    stop() {

        for (
            const effectInstance
            of this.effectInstances
        ) {

            effectInstance.stop();
        }
    }


    isDirty() {

        return (
            this.valueDirty ||
            this.maxDirty
        );
    }


    clearDirty() {

        this.valueDirty = false;
        this.maxDirty = false;
    }


    // ======================================================
    // PRIVATE
    // ======================================================

    #recalculateValue() {
        this.modifiedValue = this.baseValue;
        this.modifiedMaxValue = this.baseMaxValue;

        this.setValue(this.modifiedValue);
        this.setMax(this.modifiedMaxValue);

        this.#applyLimits();
    }


    #calculateModifierValue(
        value,
        baseChange
    ) {

        for (
            const instance
            of this.effectInstances
        ) {

            if (!instance.active) {
                continue;
            }

            const effect =
                instance.effect;


            if (
                effect.baseChange !==
                baseChange
            ) {
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


    #applyModifier(
        value,
        effect
    ) {

        if (effect.isPercent) {

            return value +
                value *
                (effect.amount / 100);
        }

        return value +
            effect.amount;
    }


    #applyLimits() {
        if (this.#value > this.#max) {
            this.setValue(this.#max);
        }
        if (this.#value < 0) {
            this.setValue(0);
        }
    }


    #checkLow() {

        if (this.#value < this.low) {

            if (!this.isLow) {

                this.isLow = true;

                this.onLow?.(
                    this
                );
            }

        } else {

            this.isLow = false;
        }
    }
}