export class GroupManager {

    constructor() {

        // key: "event:bergbau" / "party:diehelden" -> Set<playerId>
        this.groups = new Map();
    }


    #key(groupType, groupName) {

        return `${groupType}:${groupName.trim().toLowerCase()}`;
    }


    join(groupType, groupName, playerId) {

        const key =
            this.#key(groupType, groupName);

        if (!this.groups.has(key)) {
            this.groups.set(key, new Set());
        }

        this.groups.get(key).add(playerId);
    }


    leave(groupType, groupName, playerId) {

        const key =
            this.#key(groupType, groupName);

        this.groups.get(key)?.delete(playerId);
    }


    // Von allen Gruppen austreten (z.B. wenn ein Spieler die
    // Verbindung verliert), damit Gruppen nicht ewig tote
    // Mitglieder mitschleppen.
    leaveAll(playerId) {

        for (const members of this.groups.values()) {
            members.delete(playerId);
        }
    }


    members(groupType, groupName) {

        const key =
            this.#key(groupType, groupName);

        return [...(this.groups.get(key) ?? [])];
    }


    isMember(groupType, groupName, playerId) {

        const key =
            this.#key(groupType, groupName);

        return this.groups.get(key)?.has(playerId) ?? false;
    }
}
