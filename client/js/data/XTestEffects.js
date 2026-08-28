import { AttributeEffect } from "../models/common/AttributeEffect.js";

export function CreateTestEffects(player) {

    // Heilung: +5 Leben alle 2 Sekunden
    const healing = new AttributeEffect(
        5,
        2000,
        null,
        0,
        null,
        0
    );

    // Gift: -3 Leben alle 1 Sekunde, 5 Ticks
    const poison = new AttributeEffect(
        -3,
        1000,
        null,
        0,
        5,
        0
    );

    // Verzögerte Heilung
    const delayedHealing = new AttributeEffect(
        10,
        2000,
        null,
        0,
        3,
        5000
    );

    player.attributes.health.effects.push(healing);
    player.attributes.health.effects.push(poison);
    player.attributes.health.effects.push(delayedHealing);

    return {
        healing,
        poison,
        delayedHealing
    };
}