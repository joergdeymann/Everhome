import { Attribute } from "./Attribute.js";

export class Attributes {
    constructor(attributes) {
        this.health = new Attribute(attributes.health);
        this.stamina = new Attribute(attributes.stamina);
        this.mana = new Attribute(attributes.mana);

        this.strength = new Attribute(attributes.strength);
        this.speed = new Attribute(attributes.speed);
        this.dexterity = new Attribute(attributes.dexterity);       // Geschick
        this.intelligence = new Attribute(attributes.intelligence);
        this.resistance = new Attribute(attributes.resistance);
        this.perception = new Attribute(attributes.perception);     // Wahrnehmung bei Erzvorkommen 
    }

    getAll() {
        return Object.values(this);
    }
    
    start() {
        for (const attribute of this.getAll()) {
            attribute.start();
        }
    }

    stop() {
        for (const attribute of this.getAll()) {
            attribute.stop();
        }
    }    
}
