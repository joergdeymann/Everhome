export class PlayerCooldowns {

    constructor() {

        // effectId -> { readyAt, dirty }
        this.cooldowns = new Map();
    }


    isReady(effectId, now) {

        const entry =
            this.cooldowns.get(effectId);

        if (!entry) {
            return true;
        }

        return now >= entry.readyAt;
    }


    getRemaining(effectId, now) {

        const entry =
            this.cooldowns.get(effectId);

        if (!entry) {
            return 0;
        }

        return Math.max(0, entry.readyAt - now);
    }


    start(effectId, cooldownMs, now) {

        if (!cooldownMs) {

            // Kein Cooldown definiert -> nichts zu speichern.
            return;
        }

        this.cooldowns.set(effectId, {
            readyAt: now + cooldownMs,
            dirty: true
        });
    }


    // Liefert alle Änderungen seit dem letzten Aufruf:
    // - neu gestartete Cooldowns (mit Restzeit)
    // - gerade abgelaufene Cooldowns (Restzeit 0,
    //   werden danach entfernt -> "verschwinden wieder",
    //   genau wie die EffectInstanzen)
    collectDirty(now) {

        const changes = {};

        for (const [effectId, entry] of this.cooldowns.entries()) {

            const remaining =
                Math.max(0, entry.readyAt - now);

            if (remaining <= 0) {

                changes[effectId] = 0;

                this.cooldowns.delete(effectId);

                continue;
            }

            if (entry.dirty) {

                changes[effectId] = remaining;

                entry.dirty = false;
            }
        }

        return changes;
    }
}
