import { GameLoader } from "./systems/loader/GameLoader.js";
import { GameUI } from "./ui/GameUI.js";

alert();

const gameLoader = new GameLoader();

const game = await gameLoader.load();

const ui = new GameUI(game);

game.onUpdate = player => {
    ui.update(player);
};

ui.bindEvents();

game.start();

