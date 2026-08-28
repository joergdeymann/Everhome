export class EffectInstance {
    constructor(networkId, effect) {
        this.networkId = networkId;
        this.effect = effect;

        this.active = false;
        this.startedAt = null;
        this.finishedAt = null;

        // Welche Tick-Definition (effect.ticks[index]) gerade läuft.
        this.currentTick = 0;

        // Wie viele volle Zyklen (preTime+duration+postTime) der
        // aktuellen Tick-Definition schon durchlaufen wurden.
        this.cyclesUsedForCurrentTick = 0;

        // Wann der aktuelle Zyklus begonnen hat.
        this.cycleStartedAt = null;

        // Ob der Wert für den aktuellen Zyklus schon
        // angewendet wurde (einmalig, sobald preTime um ist).
        this.appliedThisCycle = false;

        // Das Attribut-Objekt, an dem diese Instanz zuletzt
        // gewirkt hat. Wird bei jedem update() aktualisiert
        // und beim Beenden gebraucht, um baseChange-Werte
        // (z.B. Ausrüstung, Buffs) wieder zurückzurechnen.
        this.boundAttribute = null;

        // Summe aller bisher angewendeten maxChange-Beträge
        // (in absoluten Werten, nicht Prozent) dieser Instanz.
        // Wird beim Beenden von baseChange-Effekten wieder
        // vom Attribut abgezogen.
        this.totalAppliedMaxChange = 0;
    }


    start(now = performance.now()) {
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
        this.cyclesUsedForCurrentTick = 0;

        // effect.delay gilt nur für den allerersten Zyklus.
        this.cycleStartedAt = now + this.effect.delay;
        this.appliedThisCycle = false;

        return true;
    }


    stop(now = performance.now()) {
        if (!this.active) {
            return false;
        }

        this.#finish(now);

        return true;
    }


    update(attribute, now) {
        if (!this.active) {
            return { ticked: false, valueAmount: 0, maxAmount: 0 };
        }

        this.boundAttribute = attribute;

        let changed = false;
        let valueAmount = 0;
        let maxAmount = 0;

        const tickDef =
            this.effect.ticks[this.currentTick];

        if (tickDef) {

            const elapsed =
                now - this.cycleStartedAt;


            // --------------------------------------------------
            // preTime vorbei -> Wert EINMALIG komplett anwenden.
            // --------------------------------------------------

            if (
                !this.appliedThisCycle &&
                elapsed >= tickDef.preTime
            ) {

                const applied =
                    this.#applyTick(attribute, tickDef);

                valueAmount = applied.valueAmount;
                maxAmount = applied.maxAmount;

                this.appliedThisCycle = true;
                changed = true;
            }


            // --------------------------------------------------
            // Ganzer Zyklus (preTime+duration+postTime) vorbei
            // -> nächsten Zyklus vorbereiten bzw. zur nächsten
            // Tick-Definition weiterschalten.
            // --------------------------------------------------

            const totalCycle =
                tickDef.preTime +
                tickDef.duration +
                tickDef.postTime;

            if (elapsed >= totalCycle) {

                this.cyclesUsedForCurrentTick++;

                if (
                    tickDef.count !== null &&
                    this.cyclesUsedForCurrentTick >= tickDef.count
                ) {

                    this.currentTick++;
                    this.cyclesUsedForCurrentTick = 0;
                }

                // Nächster Zyklus beginnt exakt am Ende des
                // vorherigen (kein Drift durch Aufruf-Timing).
                this.cycleStartedAt += totalCycle;
                this.appliedThisCycle = false;
            }
        }


        // Alle Tick-Definitionen durchlaufen -> Effekt ist
        // fertig. ABER: bei duration === null (dauerhaft, z.B.
        // Kleidung/Buffs) hält die Instanz ihren einmalig
        // angewendeten Wert weiter aktiv (baseChange bleibt
        // wirksam), statt automatisch zu enden - sie wird erst
        // durch ein explizites stop() (Klick auf "Entfernen"
        // bzw. Kleidung ausziehen) beendet.
        if (
            this.effect.duration !== null &&
            this.currentTick >= this.effect.ticks.length
        ) {

            this.#finish(now);
        }


        // Effect-weite Gesamtdauer als harte Obergrenze,
        // unabhängig vom Tick-Fortschritt.
        //
        // Semantik von effect.duration:
        //   null  -> dauerhaft, kein automatisches Ende
        //            (z.B. Kleidung/Buffs, nur manuell per
        //            "Entfernen" zu beenden).
        //   0     -> einmalig: kein zusätzlicher Timer, die
        //            Instanz endet von selbst, sobald ihre
        //            Ticks durchgelaufen sind (s.o.).
        //   > 0   -> zeitlich befristet: harte Obergrenze,
        //            unabhängig davon wie viele Ticks noch
        //            liefen (z.B. Gift).
        if (
            this.active &&
            this.effect.duration !== null &&
            this.effect.duration > 0 &&
            now >= this.startedAt + this.effect.duration
        ) {

            this.#finish(now);
        }


        return { ticked: changed, valueAmount, maxAmount };
    }


    #applyTick(attribute, tick) {

        let valueAmount = 0;
        let maxAmount = 0;

        if (tick.maxChange !== 0) {

            const ratio =
                attribute.max === 0
                    ? 0
                    : attribute.value / attribute.max;

            maxAmount = tick.maxChange;

            if (this.effect.isPercent) {
                maxAmount = attribute.max * (maxAmount / 100);
            }

            attribute.setMax(attribute.max + maxAmount);
            attribute.setValue(attribute.max * ratio);

            if (this.effect.baseChange) {
                this.totalAppliedMaxChange += maxAmount;
            }
        }

        if (tick.valueChange !== 0) {

            valueAmount = tick.valueChange;

            if (this.effect.isPercent) {
                valueAmount = attribute.value * (valueAmount / 100);
            }

            attribute.setValue(attribute.value + valueAmount);
        }

        if (attribute.value > attribute.max) {
            attribute.setValue(attribute.max);
        }

        if (attribute.value < 0) {
            attribute.setValue(0);
        }

        return { valueAmount, maxAmount };
    }


    #finish(now) {

        // baseChange-Effekte (Ausrüstung, Buffs) verändern den
        // Maximalwert dauerhaft, solange sie aktiv sind. Beim
        // Beenden (egal ob manuell per "Entfernen" oder weil
        // die Ticks/Dauer abgelaufen sind) muss diese Änderung
        // wieder zurückgerechnet werden, sonst bleibt z.B. ein
        // abgelegtes Kleidungsstück wirksam.
        if (
            this.effect.baseChange &&
            this.totalAppliedMaxChange !== 0 &&
            this.boundAttribute
        ) {

            const attribute = this.boundAttribute;

            const ratio =
                attribute.max === 0
                    ? 0
                    : attribute.value / attribute.max;

            attribute.setMax(attribute.max - this.totalAppliedMaxChange);
            attribute.setValue(attribute.max * ratio);

            if (attribute.value > attribute.max) {
                attribute.setValue(attribute.max);
            }

            if (attribute.value < 0) {
                attribute.setValue(0);
            }

            this.totalAppliedMaxChange = 0;
        }

        this.active = false;
        this.finishedAt = now;

        this.currentTick = 0;
        this.cyclesUsedForCurrentTick = 0;
        this.cycleStartedAt = null;
        this.appliedThisCycle = false;
    }
}
