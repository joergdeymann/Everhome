import fs from "fs";
import { Effect } from "../../models/common/Effect.js";

             
export class EffectLoader {

    static load(
        filePath,
        effectManager
    ) {

        const data =
            fs.readFileSync(
                filePath,
                "utf-8"
            );


        const json =
            JSON.parse(data);


        for (const effectData of json.effects) {

            const effect =
                new Effect(
                    effectData.networkId,
                    effectData.id,

                    effectData.attribute,

                    effectData.priority,
                    effectData.isPercent,
                    effectData.baseChange,

                    effectData.delay,
                    effectData.duration,
                    effectData.cooldown,

                    effectData.instances,

                    effectData.sourceInstances,
                    effectData.targetInstances,

                    effectData.sourceOnce,
                    effectData.targetOnce,

                    effectData.ticks
                );


            effectManager.registerEffect(
                effect
            );
        }
    }
}