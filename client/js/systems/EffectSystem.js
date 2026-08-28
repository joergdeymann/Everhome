export class EffectSystem {

    constructor() {
        this.effects = [];
    }

    add(effect) {
        this.effects.push(effect);
    }

 
    update(attributes, now) {
        for (const attribute of attributes.getAll()) {
            attribute.update(now);
        }
    }

}
