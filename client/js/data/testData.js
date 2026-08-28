import { Animal } from "../models/player/Animal.js";
import { Player } from "../models/player/Player.js";
import { Effect } from "../models/common/Effect.js";

export function createTestPlayer() {

    const animal = new Animal("Fuchs");

    const player = new Player(
        1,
        "Testspieler",
        animal
    );


    // --------------------------------------------------
    // Grundwerte
    // --------------------------------------------------

    player.attributes.health.max = 200;
    player.attributes.health.baseValue = 100;
    player.attributes.health.value = 100;

    player.attributes.stamina.baseValue = 100;
    player.attributes.stamina.value = 100;
    player.attributes.stamina.low = 50;

    player.attributes.strength.baseValue = 100;
    player.attributes.strength.value = 100;
    player.attributes.strength.max = 200;


    const healing = new Effect(
        "heal",
        0,          // priority
        false,      // isPercent
        false,      // baseChange

        300,        // delay
        null,        // duration
        3000,       // cooldown

        1,          // instances

        [
            {
                valueChange: 10,
                maxChange: 0,

                count: 1,
                delay: 0,
                duration: 300,
                cooldown: 0
            }
        ]
    );

    const percentHealing = new Effect(
        "heal.percent",
        0,          // priority
        true,       // isPercent
        false,      // baseChange

        0,          // delay
        null,       // duration
        0,          // cooldown
        1,          // instances

        [
            {
                valueChange: 10,   // 10 %
                maxChange: 0,

                count: 3,
                delay: 0,
                duration: 0,
                cooldown: 2000
            }
        ]
    );

    const maxHealthBuff = new Effect(
        "health.max.buff",
        0,          // priority
        true,      // isPercent
        true,       // baseChange

        0,          // delay
        null,       // duration
        0,          // cooldown
        1,          // instances

        [
            {
                valueChange: 0,
                maxChange: -10,

                count: 1,
                delay: 0,
                duration: 0,
                cooldown: 0
            }
        ]
    );

    const poison = new Effect(
        "poison",
        -3,
        false,
        true,       // baseChange
        0,
        1600,
        0,
        null,
        15,
        null,
        0
    );

    const strengthEquipment = new Effect(
        "oldTopStrange",
        1,          // priority
        false,      // isPercent
        true,       // baseChange

        0,          // delay
        0,          // duration
        3000,       // cooldown

        1,          // instances

        [
            {
                valueChange: 0,
                maxChange: 15,

                count: 1,
                delay: 0,
                duration: 0,
                cooldown: 0
            }
        ]
    );

    const strengthBuff = new Effect(
        "oldTopLiveGen",
        1,          // priority
        true,       // isPercent
        true,       // baseChange

        0,          // delay
        null,       // duration = dauerhaft
        null,       // cooldown = kein Cooldown

        2,          // instances

        [
            {
                valueChange: 0,
                maxChange: 0.1,

                count: null,
                delay: 1000,
                duration: 1000,
                cooldown: 10000
            }
        ]
    );

    // --------------------------------------------------
    // Effekte hinzufügen
    // --------------------------------------------------

    // player.attributes.health.add(healing);
    // player.attributes.health.add(poison);

    // player.attributes.strength.add(strengthEquipment);
    // player.attributes.strength.add(strengthBuff);

    // player.attributes.health.add(healing);
    // player.attributes.health.add(percentHealing);
    player.attributes.health.add(maxHealthBuff);
    // player.attributes.health.add(strengthEquipment);
    // player.attributes.health.add(strengthBuff);


    // --------------------------------------------------
    // Low-Warnungen
    // --------------------------------------------------

    player.attributes.health.onLow = (attribute) => {
        console.log(
            "Gesundheit kritisch:",
            attribute.value
        );
    };

    player.attributes.stamina.onLow = (attribute) => {
        console.log(
            "Ausdauer niedrig:",
            attribute.value
        );
    };


    return player;
}