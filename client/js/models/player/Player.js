import { Attributes } from "../common/Attributes.js";
import { Skills } from "./Skills.js";
import { Inventory } from "./Inventory.js";
import { House } from "../house/House.js";
import { Professions } from "./Professions.js";
import { Equipment } from "./Equipment.js";

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
    }
}

