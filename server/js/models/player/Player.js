import { PlayerEffects } from "../../systems/effects/PlayerEffects.js";
import { PlayerCooldowns } from "../../systems/effects/PlayerCooldowns.js";
import { Attributes } from "../common/Attributes.js";
// import { Skills } from "./Skills.js";
// import { Inventory } from "./Inventory.js";
// import { House } from "../house/House.js";
// import { Professions } from "./Professions.js";
// import { Equipment } from "./Equipment.js";

export class Player {
    constructor(id, name, animal) {
        this.id = id;
        this.name = name;
        this.animal = animal;

        // this.skills = new Skills();
        // this.inventory = new Inventory();
        // this.house = new House();
        // this.professions = new Professions();
        // this.equipment = new Equipment();
        // this.buffs = new Buffs();
        this.attributes = new Attributes(animal.attributes);
        this.effects =    new PlayerEffects();
        this.cooldowns =  new PlayerCooldowns();

        // Für-immer-Sperre (sourceOnce/targetOnce): welche
        // Effekt-IDs dieser Spieler schon einmal gewirkt bzw.
        // erhalten hat. Bleibt auch nach Ablauf der Instanz
        // bestehen, wird nie zurückgesetzt.
        this.castOnceUsed = new Set();
        this.receivedOnceUsed = new Set();

        // Noch kein echtes Rechte-/Login-System vorhanden -
        // bis dahin nur ein Flag zum Testen des Admin-Chats
        // und der Admin-Kennzeichnung (siehe IdentificationHandler).
        this.isAdmin = false;
    }
}

