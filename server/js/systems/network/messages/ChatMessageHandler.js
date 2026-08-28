import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname =
    path.dirname(fileURLToPath(import.meta.url));

// Alle Chat-Nachrichten werden zusätzlich in eine Datei
// geloggt (Nachweis bei Streit, siehe Anforderung). Bewusst
// simpel gehalten: eine Zeile JSON pro Nachricht, anhängen,
// Fehler beim Schreiben dürfen den Server nie zum Absturz
// bringen.
const LOG_FILE =
    path.join(__dirname, "..", "..", "..", "..", "data", "chat.log");


export class ChatMessageHandler {

    constructor(playerManager, groupManager) {

        this.playerManager =
            playerManager;

        this.groupManager =
            groupManager;
    }


    // Gruppe beitreten - echte Mitgliedschaft (keine Pseudo-
    // Simulation mehr), damit Gruppennachrichten nur noch bei
    // tatsächlichen Mitgliedern ankommen.
    handleJoin(player, message) {

        const groupName =
            typeof message.groupName === "string"
                ? message.groupName.trim()
                : "";

        if (!player || groupName.length === 0) {
            return;
        }

        const groupType =
            message.groupType === "party" ? "party" : "event";

        this.groupManager.join(groupType, groupName, player.id);

        if (player.socket) {

            player.socket.send(
                JSON.stringify({
                    type: "groupJoined",
                    groupType,
                    groupName
                })
            );
        }

        console.log(
            "GRUPPE BEIGETRETEN:",
            player.id, "->", groupType, groupName
        );
    }


    handleLeave(player, message) {

        const groupName =
            typeof message.groupName === "string"
                ? message.groupName.trim()
                : "";

        if (!player || groupName.length === 0) {
            return;
        }

        const groupType =
            message.groupType === "party" ? "party" : "event";

        this.groupManager.leave(groupType, groupName, player.id);

        if (player.socket) {

            player.socket.send(
                JSON.stringify({
                    type: "groupLeft",
                    groupType,
                    groupName
                })
            );
        }

        console.log(
            "GRUPPE VERLASSEN:",
            player.id, "->", groupType, groupName
        );
    }


    handle(player, message) {

        if (!player) {

            console.log(
                "CHAT-NACHRICHT VOR IDENTIFIZIERUNG IGNORIERT"
            );

            return;
        }

        const text =
            typeof message.text === "string"
                ? message.text.trim()
                : "";

        if (text.length === 0) {
            return;
        }


        const scope =
            message.scope || "world";

        const resolved =
            this.#resolveRecipientsAndTag(
                player,
                scope,
                message
            );

        if (!resolved) {

            const reason =
                scope === "group" ? "missingGroupName" :
                scope === "announcement" ? "notAdmin" :
                "unknownScope";

            console.log(
                "CHAT ABGELEHNT:",
                scope, reason
            );

            if (player.socket) {

                player.socket.send(
                    JSON.stringify({
                        type: "chatRejected",
                        reason
                    })
                );
            }

            return;
        }

        const { recipients, tag, groupName } = resolved;


        const chatMessage = {
            type: "chat",
            scope,
            tag,
            groupName: groupName || null,
            targets: scope === "selected" ? recipients.map((p) => p.id) : null,
            from: player.id,
            fromName: player.name,
            fromSpecies: player.animal.name,
            fromAdmin: player.isAdmin,
            text,
            timestamp: Date.now()
        };


        this.#log(chatMessage);


        const json =
            JSON.stringify(chatMessage);

        // Absender bekommt seine eigene Nachricht IMMER auch
        // zurück (damit z.B. eine private Unterhaltung oder
        // der Admin-Support in der eigenen History auftaucht),
        // auch wenn er selbst kein Admin/Ziel-Empfänger ist.
        const alreadySent = new Set();

        if (player.socket) {
            player.socket.send(json);
            alreadySent.add(player.id);
        }

        for (const recipient of recipients) {

            if (alreadySent.has(recipient.id)) {
                continue;
            }

            if (!recipient.connected || !recipient.socket) {
                continue;
            }

            recipient.socket.send(json);
            alreadySent.add(recipient.id);
        }
    }


    // Ermittelt Empfänger + anzuzeigenden TAG anhand des vom
    // Client gewählten Scopes.
    #resolveRecipientsAndTag(player, scope, message) {

        if (scope === "world") {

            return {
                tag: "WORLD",
                recipients: [...this.playerManager.players.values()]
            };
        }

        if (scope === "trade") {

            // Wie "world" (jeder bekommt es), nur mit dem TRADE-Tag
            // statt WORLD - für /h bzw. /t (Handel).
            return {
                tag: "TRADE",
                recipients: [...this.playerManager.players.values()]
            };
        }

        if (scope === "area") {

            // Wie "world"/"trade" - Broadcast an alle, nur mit
            // dem AREA-Tag - für /a (Gebiet).
            return {
                tag: "AREA",
                recipients: [...this.playerManager.players.values()]
            };
        }

        if (scope === "announcement") {

            // Ankündigungen dürfen nur Admins verschicken - echte
            // Durchsetzung muss serverseitig passieren, das
            // Client-UI blockt zusätzlich schon vorher ab.
            if (!player.isAdmin) {
                return null;
            }

            return {
                tag: "ANNOUNCEMENT",
                recipients: [...this.playerManager.players.values()]
            };
        }

        if (scope === "selected") {

            const targetIds =
                Array.isArray(message.targets)
                    ? message.targets
                    : [];

            const recipients =
                targetIds
                    .map((id) => this.playerManager.getPlayer(id))
                    .filter((p) => p);

            return {
                tag: "CHAT",
                recipients
            };
        }

        if (scope === "admin") {

            const recipients =
                [...this.playerManager.players.values()]
                    .filter((p) => p.isAdmin);

            return {
                tag: "ADMIN",
                recipients
            };
        }

        if (scope === "group") {

            const groupName =
                typeof message.groupName === "string"
                    ? message.groupName.trim()
                    : "";

            if (groupName.length === 0) {
                return null;
            }

            const groupType =
                message.groupType === "party" ? "party" : "event";

            // Wer eine Nachricht in eine Gruppe schickt, ist
            // damit automatisch Mitglied (bequem, entspricht
            // "im Gruppenchat mitreden") - echte Mitgliederliste,
            // keine Pseudo-Simulation mehr.
            this.groupManager.join(groupType, groupName, player.id);

            const memberIds =
                this.groupManager.members(groupType, groupName);

            const recipients =
                memberIds
                    .map((id) => this.playerManager.getPlayer(id))
                    .filter((p) => p);

            return {
                tag: groupType === "party" ? "PARTY" : "EVENT",
                groupName,
                recipients
            };
        }

        return null;
    }


    #log(chatMessage) {

        const line =
            JSON.stringify(chatMessage) + "\n";

        fs.appendFile(
            LOG_FILE,
            line,
            (error) => {

                if (error) {

                    console.log(
                        "FEHLER BEIM CHAT-LOGGING:",
                        error.message
                    );
                }
            }
        );
    }
}
