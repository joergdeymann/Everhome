export class GameUI {

    constructor(game) {
        this.game = game;

        this.playerName = document.getElementById("playerName");
        this.animalName = document.getElementById("animalName");

        this.health = document.getElementById("health");
        this.stamina = document.getElementById("stamina");
        this.strength = document.getElementById("strength");

        this.startButton = document.getElementById("start");
        this.stopButton = document.getElementById("stop");
        this.restartButton = document.getElementById("restart");
    }


    bindEvents() {

        this.startButton.addEventListener("click", () => {
            this.game.player.attributes.start();
        });


        this.stopButton.addEventListener("click", () => {
            this.game.player.attributes.stop();
        });


        this.restartButton.addEventListener("click", () => {
            this.game.player.attributes.start();
        });
    }


    update(player) {
console.log(
    "STRENGTH:",
    player.attributes.strength
);
        this.playerName.textContent =
            player.name;

        this.animalName.textContent =
            player.animal.name;

        const t = this.game.translation;
        
        this.health.textContent =
        `${t.get("attribute", "health")}: ` +
        `${player.attributes.health.value} / ` +
        `${player.attributes.health.max}`;

        this.stamina.textContent =
        `${t.get("attribute", "stamina")}: ` +
        `${player.attributes.stamina.value} / ` +
        `${player.attributes.stamina.max}`;

        this.strength.textContent =
            `${t.get("attribute", "strength")}: ` +
            player.attributes.strength.value;

        this.strength.textContent =
            `Base: ${player.attributes.strength.baseValue} | ` +
            `Modified: ${player.attributes.strength.modifiedValue} | ` +
            `Value: ${player.attributes.strength.value}`;

        if (player.attributes.health.isLow) {
            this.health.textContent +=
                ` ⚠ ${t.get("warning", "healthLow")}`;
        }

        if (player.attributes.stamina.isLow) {
            this.stamina.textContent +=
                ` ⚠ ${t.get("warning", "staminaLow")}`;
        }    
        
        this.startButton.textContent = t.get("button", "startEffects")
        this.stopButton.textContent = t.get("button", "stopEffects")
        this.restartButton.textContent = t.get("button", "restartEffects")

    }
}