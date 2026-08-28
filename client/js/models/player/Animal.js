export class Animal {
    constructor(name) {
        this.name = name;

        this.attributes = {
            health: 100,
            stamina: 100,
            mana: 0,

            strength: 10,
            speed: 10,
            dexterity: 10,
            intelligence: 10,
            resistance: 10,
            perception: 10
        };
    }
}
