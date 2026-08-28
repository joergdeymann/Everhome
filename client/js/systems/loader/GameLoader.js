import { Loader } from "./Loader.js";
import { Translation } from "../localization/Translation.js";
import { createTestPlayer } from "../../data/testData.js";
import { Game } from "../Game.js";

export class GameLoader {

    constructor() {
        this.loader = new Loader();
        this.translation = new Translation([
            "de-DE",
            "en-US"
        ]);

        this.registerTasks();

    }

    registerTasks() {

        this.loader.add(
            "player",
            () => createTestPlayer(),
            {
                required: true,
                priority: 100
            }
        );

        this.loader.add(
            "translation",
            () => this.translation.load(),
            {
                required: false,
                priority: 10
            }
        );
    }

    async load() {

        const [player] =
            await this.loader.loadRequired();

        const game = new Game(player,this.translation);

        this.loader.startBackground();

        return game;
    }
}