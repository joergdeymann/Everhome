import { GameLoop } from "./GameLoop.js";
import { EffectSystem } from "./EffectSystem.js";

export class Game {

    constructor(player, translation) {
        this.player = player;
        this.translation = translation;

        this.effectSystem = new EffectSystem();
        this.gameLoop = new GameLoop(100);

        this.onUpdate = null;
    }

start() {

    // console.log("Game.start() wurde aufgerufen");

    this.player.attributes.start();

    this.gameLoop.start(
        (now) => this.update(now)
    );
}

    stop() {
        this.player.attributes.stop();
        this.gameLoop.stop();
    }

    update(now) {

        this.effectSystem.update(
            this.player.attributes,
            now
        );

        if (this.onUpdate) {
            this.onUpdate(this.player);
        }
    }
}