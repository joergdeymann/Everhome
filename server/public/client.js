const playerIdElement =
    document.getElementById("playerId");

const historyElement =
    document.getElementById("history");

const playersElement =
    document.getElementById("players");

const catalogElement =
    document.getElementById("catalog");

const sendButton =
    document.getElementById("send");

const chatInput =
    document.getElementById("chatInput");

const chatSendButton =
    document.getElementById("chatSend");

const comboModeToggle =
    document.getElementById("comboModeToggle");

const castButton =
    document.getElementById("castButton");

const reloadEffectsButton =
    document.getElementById("reloadEffectsButton");

const chatPanel =
    document.getElementById("chatPanel");

const chatTabsElement =
    document.getElementById("chatTabs");

const chatSettingsPanel =
    document.getElementById("chatSettingsPanel");

const chatLeaveAdminButton =
    document.getElementById("chatLeaveAdminButton");

const chatScopeSelect =
    document.getElementById("chatScope");

const chatGroupTypeSelect =
    document.getElementById("chatGroupType");

const chatGroupNameInput =
    document.getElementById("chatGroupName");

const chatTargetSelect =
    document.getElementById("chatTargetSelect");


if (
    !playerIdElement || !historyElement || !playersElement ||
    !catalogElement || !sendButton || !chatInput || !chatSendButton ||
    !comboModeToggle || !castButton || !reloadEffectsButton ||
    !chatPanel || !chatTabsElement || !chatSettingsPanel ||
    !chatLeaveAdminButton || !chatScopeSelect || !chatGroupTypeSelect ||
    !chatGroupNameInput || !chatTargetSelect
) {
    throw new Error(
        "Game-UI konnte nicht gefunden werden."
    );
}

const savedPlayerId =
    sessionStorage.getItem("playerId");

const savedCatalogRaw =
    sessionStorage.getItem("effectCatalog");

const savedCatalog =
    savedCatalogRaw ? JSON.parse(savedCatalogRaw) : null;

// --------------------------------------------------
// Zustand
// --------------------------------------------------

let selfId = null;
let selfIsAdmin = false;

// playerId -> { name, health, strength, effects }
// effects: Map<networkId, { id, expiresAt }>  (expiresAt === null -> dauerhaft)
const players = new Map();

// Katalog aller im Spiel existierenden Effekte
// (unabhängig davon, ob gerade aktiv). Aus Cache
// vorbefüllt, falls schon mal geladen.
let effectCatalog = savedCatalog ? savedCatalog.effects : [];

// Aktuelle Auswahl: mehrere Ziele gleichzeitig möglich.
const selectedTargetIds = new Set();

// "immediate" (Standard, Fall a): Klick auf einen Zauber
// wirkt SOFORT auf alle aktuell ausgewählten Ziele.
// "combo" (Fall c, per Schalter aktivierbar): Zauber werden
// erst gesammelt (selectedSpellIds) und erst beim Druck auf
// den "Wirken"-Button gemeinsam auf alle Ziele gewirkt.
let castMode = "immediate";
const selectedSpellIds = new Set();


// --------------------------------------------------
// Kleine Speicher-Helfer (localStorage, mit Fallback)
// --------------------------------------------------

function loadFromStorage(key, fallback) {

    try {

        const raw =
            localStorage.getItem(key);

        return raw ? JSON.parse(raw) : fallback;

    } catch {

        return fallback;
    }
}

function saveToStorage(key, value) {

    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // localStorage evtl. nicht verfügbar - kein
        // Beinbruch, dann wird beim nächsten Laden einfach
        // wieder der Standard verwendet.
    }
}

const MAX_PLAYER_BOXES = 3;

// Instant-Effekte (duration: 0) trotzdem kurz sichtbar
// aufblitzen lassen, statt sofort wieder zu verschwinden.
const MIN_DISPLAY_MS = 800;

// effectId (string) -> Zeitpunkt (Date.now()), ab dem die
// Abklingzeit vorbei ist. Nur für die eigene Person relevant.
const cooldownReadyAt = new Map();


// --------------------------------------------------
// WebSocket (Klasse: kapselt Verbindungsaufbau, Reconnect
// mit Backoff, und sicheres Senden)
// --------------------------------------------------

class SocketConnection {

    constructor(url, { onMessage, onStatus }) {

        this.url = url;
        this.onMessage = onMessage;
        this.onStatus = onStatus;

        this.socket = null;
        this.reconnectAttempt = 0;
        this.reconnectTimer = null;
        this.everOpened = false;
    }


    connect() {

        this.socket =
            new WebSocket(this.url);

        this.socket.addEventListener("open", () => {

            this.reconnectAttempt = 0;

            if (this.everOpened) {
                this.onStatus("Verbindung wiederhergestellt");
            }

            this.everOpened = true;

            this.socket.send(
                JSON.stringify({
                    type: "identify",
                    playerId: savedPlayerId
                        ? Number(savedPlayerId)
                        : null,
                    catalogVersion: savedCatalog
                        ? savedCatalog.version
                        : null
                })
            );
        });

        this.socket.addEventListener("message", (event) => {
            this.onMessage(JSON.parse(event.data));
        });

        this.socket.addEventListener("close", () => {

            this.onStatus("Verbindung zum Server beendet - versuche erneut zu verbinden ...");
            this.#scheduleReconnect();
        });

        this.socket.addEventListener("error", (error) => {
            console.error("WEBSOCKET FEHLER:", error);
        });
    }


    #scheduleReconnect() {

        if (this.reconnectTimer !== null) {
            return;
        }

        this.reconnectAttempt++;

        // Exponentielles Backoff, gedeckelt bei 10s, damit ein
        // dauerhaft nicht erreichbarer Server nicht Sturm klingelt.
        const delay =
            Math.min(10000, 500 * (2 ** this.reconnectAttempt));

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }


    // Alle ausgehenden Nachrichten laufen über diese Methode
    // statt direkt über socket.send() - damit eine tote/gerade
    // neu aufgebaute Verbindung nicht zu einer stillen,
    // unsichtbar verschluckten Exception führt (das sah für den
    // Spieler wie "kurz geflackert, aber nichts angekommen" aus).
    safeSend(payload) {

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {

            this.onStatus("Nicht verbunden - Nachricht konnte nicht gesendet werden");
            return false;
        }

        try {

            this.socket.send(JSON.stringify(payload));
            return true;

        } catch (error) {

            console.error("SENDEFEHLER:", error);
            this.onStatus("Nachricht konnte nicht gesendet werden (Verbindungsfehler)");
            return false;
        }
    }
}

// Wichtig: NICHT window.location.host verwenden - das ist
// der Port, über den die HTML-Seite selbst ausgeliefert
// wurde (z.B. ein Live-Server-Plugin im Editor auf Port
// 5500), nicht zwangsläufig der Port, auf dem der eigentliche
// Node-Server (app.js, PORT env, Standard 8080) läuft.
const SERVER_PORT = 8080;

const protocol =
    window.location.protocol === "https:" ? "wss:" : "ws:";

const SOCKET_URL =
    `${protocol}//${window.location.hostname}:${SERVER_PORT}`;

const connection =
    new SocketConnection(SOCKET_URL, {
        onMessage: (message) => handleMessage(message),
        onStatus: (text) => logSystem(text)
    });

connection.connect();

// Rest der Datei benutzt weiter die einfache Funktion
// safeSend(payload) - spart es, jeden bestehenden Aufruf auf
// "connection.safeSend(...)" umzuschreiben.
function safeSend(payload) {
    return connection.safeSend(payload);
}


// --------------------------------------------------
// Nachrichten-Verteilung
// --------------------------------------------------

function handleMessage(message) {

    switch (message.type) {

        case "identified":
            onIdentified(message);
            return;

        case "playerList":
            onPlayerList(message);
            return;

        case "effectCatalog":
            onEffectCatalog(message);
            return;

        case "effectCatalogUnchanged":
            logSystem("Effekt-Katalog unverändert (aus Cache übernommen)");
            return;

        case "playerJoined":
            onPlayerJoined(message);
            return;

        case "playerLeft":
            onPlayerLeft(message);
            return;

        case "state":
            onState(message);
            return;

        case "effect":
            onEffect(message);
            return;

        case "effectTick":
            onEffectTick(message);
            return;

        case "effectRemoved":
            onEffectRemoved(message);
            return;

        case "effectRejected":
            onEffectRejected(message);
            return;

        case "reloadFailed":
            logSystem(`Neuladen fehlgeschlagen: ${message.error}`);
            return;

        case "whoamiResult":
            logSystem(
                `Du bist "${message.name}" (#${message.playerId}), Spezies: ${message.species}` +
                (message.isAdmin ? ", Admin" : "")
            );
            return;

        case "chat":
            chatUI.onChat(message);
            return;

        case "chatRejected":
            logSystem(
                message.reason === "missingGroupName"
                    ? "Nachricht abgelehnt: Gruppenname fehlt"
                    : message.reason === "notAdmin"
                        ? "Nachricht abgelehnt: Ankündigungen dürfen nur Admins schreiben"
                        : `Nachricht abgelehnt: ${message.reason}`
            );
            return;

        case "groupJoined":
        case "groupLeft":
            // Server-Bestätigung, keine weitere Aktion nötig -
            // der Client hat den Zustand schon beim Senden von
            // "::"/":exit" lokal übernommen.
            return;

        default:
            logSystem(JSON.stringify(message));
    }
}


function onIdentified(message) {

    selfId = message.playerId;
    selfIsAdmin = message.isAdmin === true;

    sessionStorage.setItem(
        "playerId",
        String(message.playerId)
    );

    playerIdElement.textContent =
        String(message.playerId);

    logSystem(
        `Identifiziert als "${message.name}" (#${message.playerId})`
    );
}


function onPlayerList(message) {

    for (const p of message.players) {
        upsertPlayer(p);
    }

    renderPlayers();
}


function onEffectCatalog(message) {

    effectCatalog = message.effects;

    sessionStorage.setItem(
        "effectCatalog",
        JSON.stringify({
            version: message.version,
            effects: message.effects
        })
    );

    renderCatalog();
}


function onPlayerJoined(message) {

    upsertPlayer(message);

    logSystem(`${message.name} (#${message.playerId}) ist beigetreten`);

    renderPlayers();
}


function onPlayerLeft(message) {

    const player =
        players.get(message.playerId);

    if (player) {
        logSystem(`${player.name} (#${message.playerId}) hat die Verbindung getrennt`);
    }

    players.delete(message.playerId);

    renderPlayers();
}


function onState(message) {

    const player =
        players.get(message.playerId);

    if (!player) {
        return;
    }

    if (message.attributes) {

        for (const [name, data] of Object.entries(message.attributes)) {

            if (name === "health" || name === "strength") {
                player[name] = { value: data.value, max: data.max };
            }
        }
    }

    // Cooldowns betreffen nur einen selbst.
    if (message.cooldowns) {

        let cooldownsChanged = false;

        for (const [effectId, remaining] of Object.entries(message.cooldowns)) {

            if (remaining <= 0) {

                if (cooldownReadyAt.delete(effectId)) {
                    cooldownsChanged = true;
                }

                logSystem(`Abklingzeit vorbei: ${effectId}`);

            } else {

                cooldownReadyAt.set(effectId, Date.now() + remaining);
                cooldownsChanged = true;
            }
        }

        if (cooldownsChanged) {
            renderCatalog();
        }
    }

    renderPlayers();
}


function onEffect(message) {

    const target =
        players.get(message.target);

    const caster =
        players.get(message.from);

    const casterName =
        caster ? caster.name : `#${message.from}`;

    if (target) {

        const now = Date.now();

        for (const effect of message.effects) {

            const displayMs =
                effect.duration === null
                    ? null
                    : Math.max(effect.duration, MIN_DISPLAY_MS);

            // Key ist die INSTANZ-ID, nicht die Effekt-Typ-ID -
            // sonst würde ein zweiter Cast desselben Effekts
            // den ersten in der Liste einfach überschreiben.
            target.effects.set(effect.instanceId, {
                instanceId: effect.instanceId,
                networkId: effect.networkId,
                id: effect.id,
                isPercent: effect.isPercent,
                targetId: message.target,
                expiresAt: displayMs === null
                    ? null
                    : now + displayMs,
                // Für den Wirk-Balken: Zeitpunkt (Client-Uhr),
                // ab dem die Instanz zu laufen begann.
                clientStartedAt: now,
                // Zuletzt berechneter Betrag (wichtig bei %,
                // da man sonst nur "20%" sieht, nicht wie viel
                // das tatsächlich war). Kommt erst mit dem
                // ersten "effectTick" nach.
                lastValueAmount: null,
                lastMaxAmount: null
            });

            logEffect(
                `${casterName} wirkt "${effect.id}" auf ${target.name}`
            );
        }
    }

    renderPlayers();
}


function onEffectTick(message) {

    const target =
        players.get(message.target);

    if (!target) {
        return;
    }

    const effect =
        target.effects.get(message.instanceId);

    if (!effect) {
        return;
    }

    effect.lastValueAmount = message.valueAmount;
    effect.lastMaxAmount = message.maxAmount;

    // Kein renderPlayers() (würde die komplette Box neu
    // aufbauen) - nur die betroffene Zeile gezielt updaten.
    updateEffectValueDisplay(message.target, message.instanceId, effect);
}


function onEffectRemoved(message) {

    const target =
        players.get(message.target);

    if (target) {
        target.effects.delete(message.instanceId);
    }

    renderPlayers();
}


function onEffectRejected(message) {

    for (const rejected of message.effects) {

        const targetPlayer =
            rejected.target !== undefined
                ? players.get(rejected.target)
                : null;

        const targetSuffix =
            targetPlayer
                ? ` (Ziel: ${targetPlayer.name})`
                : "";

        if (rejected.reason === "sourceInstances") {

            logSystem(
                `Abgelehnt: ${rejected.effectId} - du hast schon die maximale Anzahl aktiver Instanzen${targetSuffix}`
            );

        } else if (rejected.reason === "targetInstances") {

            logSystem(
                `Abgelehnt: ${rejected.effectId} - Ziel hat schon die maximale Anzahl aktiver Instanzen${targetSuffix}`
            );

        } else if (rejected.reason === "sourceOnce") {

            logSystem(
                `Abgelehnt: ${rejected.effectId} - du hast diesen Effekt schon einmal gewirkt (für immer gesperrt)`
            );

        } else if (rejected.reason === "targetOnce") {

            logSystem(
                `Abgelehnt: ${rejected.effectId} - Ziel hat diesen Effekt schon einmal erhalten (für immer gesperrt)${targetSuffix}`
            );

        } else {

            logSystem(
                `Abklingzeit aktiv: ${rejected.effectId} ` +
                `(noch ${Math.ceil(rejected.remaining)}ms) - ganze Aktion abgelehnt`
            );
        }
    }
}


// Chat-Rendering/Logik ist jetzt in der ChatUI-Klasse weiter
// unten in dieser Datei gekapselt (siehe "class ChatUI").


// --------------------------------------------------
// Spieler-Zustand
// --------------------------------------------------

function upsertPlayer(data) {

    const existing =
        players.get(data.playerId);

    players.set(data.playerId, {
        name: data.name,
        health: data.health,
        strength: data.strength,
        effects: existing ? existing.effects : new Map()
    });
}


function castOnSelectedTargets(spellIds) {

    if (spellIds.length === 0) {
        return;
    }

    if (selectedTargetIds.size === 0) {
        logSystem("Kein Ziel ausgewählt");
        return;
    }

    // Eine einzige Nachricht mit allen Zielen: der Server
    // prüft/startet die Abklingzeit dadurch einmal pro Zauber
    // für die ganze Aktion, nicht pro Ziel (löst das
    // "Abklingzeit nur beim ersten Ziel verbraucht"-Problem
    // bei Mehrfachzielen).
    safeSend({
        type: "effect",
        id: spellIds,
        targets: [...selectedTargetIds]
    });
}


function updateCastButtonState() {

    const comboActive =
        castMode === "combo";

    castButton.style.display =
        comboActive ? "inline-block" : "none";

    castButton.disabled = !(
        comboActive &&
        selectedSpellIds.size > 0 &&
        selectedTargetIds.size > 0
    );
}


// --------------------------------------------------
// Rendering
// --------------------------------------------------

function renderPlayers() {

    const now = Date.now();

    purgeExpiredEffects(now);

    playersElement.innerHTML = "";

    const list =
        [...players.entries()].slice(0, MAX_PLAYER_BOXES);

    for (const [playerId, player] of list) {

        playersElement.appendChild(
            buildPlayerBox(playerId, player, now)
        );
    }
}


// Entfernt abgelaufene Effekte aus dem Datenmodell. Gibt
// zurück, ob sich dabei etwas geändert hat (-> Aufrufer weiß,
// ob ein renderPlayers() nötig ist).
function purgeExpiredEffects(now) {

    let changed = false;

    for (const player of players.values()) {

        for (const [networkId, effect] of player.effects.entries()) {

            if (effect.expiresAt !== null && now >= effect.expiresAt) {
                player.effects.delete(networkId);
                changed = true;
            }
        }
    }

    return changed;
}


function buildPlayerBox(playerId, player, now) {

    const box =
        document.createElement("div");

    box.className =
        "player-box" +
        (playerId === selfId ? " is-self" : "") +
        (selectedTargetIds.has(playerId) ? " is-target" : "");

    box.addEventListener("click", () => {

        if (selectedTargetIds.has(playerId)) {
            selectedTargetIds.delete(playerId);
        } else {
            selectedTargetIds.add(playerId);
        }

        renderPlayers();
        updateCastButtonState();

        // Standard-Modus: Spieler anklicken bereitet auch
        // gleich einen Chat-Send vor. Action-Modus: Klicks auf
        // die Boxen betreffen NUR das Zauber-Targeting, der
        // Chat bleibt unangetastet.
        if (chatUI.interactionMode === "standard" && playerId !== selfId) {

            if (selectedTargetIds.size === 1) {

                const onlyId = [...selectedTargetIds][0];

                chatUI.setActiveTarget({
                    type: "private",
                    targetId: onlyId,
                    targetName: players.get(onlyId)?.name ?? `#${onlyId}`
                });

            } else if (selectedTargetIds.size > 1) {

                chatUI.setActiveTarget({ type: "private-multi", targetIds: [...selectedTargetIds] });

            } else {

                chatUI.setActiveTarget({ type: "world" });
            }
        }
    });


    const nameRow =
        document.createElement("div");

    nameRow.className = "player-name";
    nameRow.innerHTML =
        `<span>${escapeHtml(player.name)}</span>` +
        `<span class="id-tag">#${playerId}</span>`;

    box.appendChild(nameRow);
    box.appendChild(document.createElement("hr"));

    box.appendChild(
        buildStatRow("Leben", player.health, "health")
    );

    box.appendChild(
        buildStatRow("Stärke", player.strength, "strength")
    );

    box.appendChild(document.createElement("hr"));

    const effectsTitle =
        document.createElement("div");

    effectsTitle.className = "effects-title";
    effectsTitle.textContent = "Aktive Effekte";

    box.appendChild(effectsTitle);


    const effectsList =
        document.createElement("div");

    effectsList.className = "effects-list";

    if (player.effects.size === 0) {

        const empty =
            document.createElement("div");

        empty.className = "no-effects";
        empty.textContent = "— keine —";

        effectsList.appendChild(empty);

    } else {

        for (const [networkId, effect] of player.effects.entries()) {

            effectsList.appendChild(
                buildEffectRow(effect, now)
            );
        }
    }

    box.appendChild(effectsList);

    return box;
}


function buildStatRow(label, attribute, kind) {

    const row =
        document.createElement("div");

    row.className = "stat-row";

    const value = attribute?.value ?? 0;
    const max = attribute?.max ?? 0;
    const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

    row.innerHTML =
        `<span class="stat-label">${label}</span>` +
        `<span class="num w-stat">${value.toFixed(2)} / ${max.toFixed(2)}</span>` +
        `<span class="bar-track">` +
        `<span class="bar-fill ${kind}" style="width:${percent}%"></span>` +
        `</span>`;

    return row;
}


function buildEffectRow(effect, now) {

    const row =
        document.createElement("div");

    row.className = "effect-row";

    // Für gezielte Updates (Countdown, Wirk-Balken) ohne
    // die ganze Box neu aufzubauen -> verhindert das
    // Hover-Flackern, das entsteht, wenn Elemente unter der
    // Maus alle 200ms komplett neu erzeugt werden.
    row.dataset.targetId = String(effect.targetId);
    row.dataset.instanceId = String(effect.instanceId);

    const timeLabel =
        effect.expiresAt === null
            ? "dauerhaft"
            : Math.max(0, (effect.expiresAt - now) / 1000).toFixed(1) + "s";

    const valueLabel =
        buildEffectValueLabel(effect);

    row.innerHTML =
        `<span>` +
        `<span class="effect-name">${escapeHtml(effect.id)}</span>` +
        `<span class="effect-instance-id">#${effect.instanceId}</span>` +
        `<span class="effect-value">${valueLabel}</span>` +
        `</span>` +
        `<span class="num w-time effect-time">${timeLabel}</span>` +
        `<button class="effect-remove-btn" type="button">✕</button>`;

    const removeButton =
        row.querySelector(".effect-remove-btn");

    removeButton.addEventListener("click", (event) => {

        // Nicht gleichzeitig die Box selbst anklicken
        // (würde sonst die Ziel-Auswahl umschalten).
        event.stopPropagation();

        safeSend({
            type: "removeEffect",
            target: effect.targetId,
            instanceId: effect.instanceId
        });
    });

    const castBar =
        buildCastBar(effect, now);

    if (castBar) {
        row.appendChild(castBar);
    }

    return row;
}


// Zeigt bei %-Effekten den zuletzt tatsächlich berechneten
// Betrag an (z.B. "20% -> +14.00"), sonst nichts.
function buildEffectValueLabel(effect) {

    if (!effect.isPercent) {
        return "";
    }

    const parts = [];

    if (effect.lastValueAmount) {

        const sign = effect.lastValueAmount >= 0 ? "+" : "";
        parts.push(`Wert ${sign}${effect.lastValueAmount.toFixed(2)}`);
    }

    if (effect.lastMaxAmount) {

        const sign = effect.lastMaxAmount >= 0 ? "+" : "";
        parts.push(`Max ${sign}${effect.lastMaxAmount.toFixed(2)}`);
    }

    return parts.length > 0 ? `(${parts.join(", ")})` : "(noch nicht gewirkt)";
}


// Findet die catalog-Definition der Ticks zu diesem Effekt
// (per networkId, wenn vorhanden, sonst per id-String als
// Fallback für ältere Einträge im Datenmodell).
function findCatalogEffect(effect) {

    if (effect.networkId !== undefined) {

        const byNetworkId =
            effectCatalog.find((e) => e.networkId === effect.networkId);

        if (byNetworkId) {
            return byNetworkId;
        }
    }

    return effectCatalog.find((e) => e.id === effect.id) ?? null;
}


// Baut den Wirk-Balken: preTime/duration/postTime des ERSTEN
// Ticks farblich unterschieden, mit einer Abdeckung, die sich
// mit der Zeit von rechts zurückzieht. Bei endlicher Tick-
// Anzahl ist das ein einmaliger Durchlauf über die komplette
// Lebenszeit, bei unendlicher (dauerhafte Buffs) ein Puls pro
// Zyklus.
function buildCastBar(effect, now) {

    const catalogEffect =
        findCatalogEffect(effect);

    const tick =
        catalogEffect?.ticks?.[0];

    if (!tick) {
        return null;
    }

    const totalCycle =
        tick.preTime + tick.duration + tick.postTime;

    if (totalCycle <= 0) {
        return null;
    }

    const preFraction =
        tick.preTime / totalCycle;

    const activeFraction =
        tick.duration / totalCycle;

    const bar =
        document.createElement("div");

    bar.className = "cast-bar";

    bar.dataset.preTime = String(tick.preTime);
    bar.dataset.duration = String(tick.duration);
    bar.dataset.postTime = String(tick.postTime);
    bar.dataset.count = tick.count === null ? "" : String(tick.count);
    bar.dataset.startedAt = String(effect.clientStartedAt);

    const track =
        document.createElement("div");

    track.className = "cast-bar-track";
    track.style.background =
        "linear-gradient(to right," +
        ` var(--cast-pre) 0%, var(--cast-pre) ${(preFraction * 100).toFixed(2)}%,` +
        ` var(--cast-active) ${(preFraction * 100).toFixed(2)}%, var(--cast-active) ${((preFraction + activeFraction) * 100).toFixed(2)}%,` +
        ` var(--cast-post) ${((preFraction + activeFraction) * 100).toFixed(2)}%, var(--cast-post) 100%)`;

    const cover =
        document.createElement("div");

    cover.className = "cast-bar-cover";

    bar.appendChild(track);
    bar.appendChild(cover);

    updateCastBarProgress(bar, now);

    return bar;
}


// Aktualisiert nur die Abdeckung (Fortschritt) eines
// bestehenden Wirk-Balkens, ohne ihn neu zu bauen.
function updateCastBarProgress(bar, now) {

    const preTime = Number(bar.dataset.preTime);
    const duration = Number(bar.dataset.duration);
    const postTime = Number(bar.dataset.postTime);
    const startedAt = Number(bar.dataset.startedAt);
    const countRaw = bar.dataset.count;

    const totalCycle = preTime + duration + postTime;

    if (totalCycle <= 0) {
        return;
    }

    const elapsed =
        Math.max(0, now - startedAt);

    let progress;

    if (countRaw === "") {

        // Unendlich wiederholend (dauerhafter Buff) ->
        // Fortschritt innerhalb des AKTUELLEN Zyklus, pulsiert
        // also immer wieder von vorn.
        progress = (elapsed % totalCycle) / totalCycle;

    } else {

        const count = Number(countRaw);
        const totalLifetime = totalCycle * count;

        progress =
            totalLifetime > 0
                ? Math.min(1, elapsed / totalLifetime)
                : 1;
    }

    const cover =
        bar.querySelector(".cast-bar-cover");

    if (cover) {
        cover.style.width = ((1 - progress) * 100).toFixed(2) + "%";
    }
}


function escapeHtml(text) {

    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// Aktualisiert nur den berechneten-Wert-Text einer einzelnen
// Effekt-Zeile (nach einem "effectTick"), ohne die Box neu
// aufzubauen.
function updateEffectValueDisplay(targetId, instanceId, effect) {

    const row =
        document.querySelector(
            `.effect-row[data-target-id="${targetId}"][data-instance-id="${instanceId}"]`
        );

    if (!row) {
        return;
    }

    const valueSpan =
        row.querySelector(".effect-value");

    if (valueSpan) {
        valueSpan.textContent = buildEffectValueLabel(effect);
    }
}


// Läuft alle 200ms unabhängig von neuen Nachrichten:
// - lässt abgelaufene Effekte "verschwinden" (Countdown = 0)
// - lässt abgelaufene Abklingzeiten von den Katalog-Karten
//   verschwinden
// - aktualisiert Countdown-Text und Wirk-Balken
// Wichtig: baut die Boxen NICHT jedes Mal komplett neu auf -
// nur wenn sich strukturell etwas geändert hat (Effekt oder
// Cooldown abgelaufen). Das behebt das Hover-Flackern, das
// entstand, weil unter der Maus liegende Elemente alle 200ms
// durch frische Kopien ersetzt wurden.
function tickUiTimers() {

    const now = Date.now();

    let cooldownExpired = false;

    for (const [effectId, readyAt] of cooldownReadyAt.entries()) {

        if (now >= readyAt) {
            cooldownReadyAt.delete(effectId);
            cooldownExpired = true;
        }
    }

    if (cooldownExpired) {
        renderCatalog();
    }

    if (purgeExpiredEffects(now)) {

        renderPlayers();
        return;
    }

    document.querySelectorAll(".effect-time").forEach((el) => {

        const row = el.closest(".effect-row");

        if (!row) {
            return;
        }

        const targetId = Number(row.dataset.targetId);
        const instanceId = Number(row.dataset.instanceId);

        const player = players.get(targetId);
        const effect = player?.effects.get(instanceId);

        if (!effect) {
            return;
        }

        el.textContent =
            effect.expiresAt === null
                ? "dauerhaft"
                : Math.max(0, (effect.expiresAt - now) / 1000).toFixed(1) + "s";
    });

    document.querySelectorAll(".cast-bar").forEach((bar) => {
        updateCastBarProgress(bar, now);
    });
}

setInterval(tickUiTimers, 200);


// Falls aus dem Cache vorbefüllt, sofort anzeigen -
// noch bevor die Server-Antwort da ist.
if (effectCatalog.length > 0) {
    renderCatalog();
}


function renderCatalog() {

    catalogElement.innerHTML = "";

    for (const effect of effectCatalog) {

        catalogElement.appendChild(
            buildCatalogCard(effect)
        );
    }
}


function buildCatalogCard(effect) {

    const card =
        document.createElement("div");

    const onCooldown =
        cooldownReadyAt.has(effect.id) &&
        cooldownReadyAt.get(effect.id) > Date.now();

    card.className =
        "catalog-card" +
        (castMode === "combo" && selectedSpellIds.has(effect.networkId) ? " is-selected" : "") +
        (onCooldown ? " on-cooldown" : "");

    card.addEventListener("click", (event) => {

        // Kombi-Modus ODER Shift gehalten -> sammeln statt
        // sofort wirken. Shift funktioniert dabei UNABHÄNGIG
        // vom Checkbox-Schalter (zweiter Weg zum selben Ziel,
        // siehe keyup-Listener weiter unten fürs Auslösen).
        if (castMode === "combo" || event.shiftKey) {

            if (selectedSpellIds.has(effect.networkId)) {
                selectedSpellIds.delete(effect.networkId);
            } else {
                selectedSpellIds.add(effect.networkId);
            }

            renderCatalog();
            updateCastButtonState();

        } else {

            // Sofort-Modus: ein Klick wirkt direkt auf alle
            // gerade ausgewählten Ziele.
            castOnSelectedTargets([effect.networkId]);
        }
    });

    const durationLabel =
        effect.duration === null
            ? "dauerhaft"
            : effect.duration === 0
                ? "einmalig"
                : (effect.duration / 1000) + "s";

    const cooldownLabel =
        !effect.cooldown
            ? "—"
            : (effect.cooldown / 1000) + "s";

    const delayLabel =
        !effect.delay
            ? "—"
            : effect.delay + "ms";

    const sourceInstancesLabel =
        effect.sourceOnce
            ? "einmalig (für immer)"
            : effect.sourceInstances === null
                ? "unbegrenzt"
                : effect.sourceInstances;

    const targetInstancesLabel =
        effect.targetOnce
            ? "einmalig (für immer)"
            : effect.targetInstances === null
                ? "unbegrenzt"
                : effect.targetInstances;

    card.innerHTML =
        `<div class="catalog-name">${escapeHtml(effect.id)}${effect.isPercent ? ' <span class="percent-badge">%</span>' : ""}</div>` +
        `<div class="catalog-id">#${effect.networkId}</div>` +
        `<div class="catalog-row"><span>Attribut</span><span>${escapeHtml(effect.attribute)}</span></div>` +
        `<div class="catalog-row"><span>Delay</span><span>${delayLabel}</span></div>` +
        `<div class="catalog-row"><span>Dauer</span><span>${durationLabel}</span></div>` +
        `<div class="catalog-row"><span>Abklingzeit</span><span>${cooldownLabel}</span></div>` +
        `<div class="catalog-row"><span>Max je Auslöser</span><span>${sourceInstancesLabel}</span></div>` +
        `<div class="catalog-row"><span>Max je Ziel</span><span>${targetInstancesLabel}</span></div>`;


    // Separates Unterfenster für die Ticks, damit man
    // z.B. bei "poison" analysieren kann, wie oft/stark
    // er tatsächlich wirkt.
    const ticksBox =
        document.createElement("div");

    ticksBox.className = "ticks-box";

    const ticksTitle =
        document.createElement("div");

    ticksTitle.className = "ticks-title";
    ticksTitle.textContent = `Ticks (${effect.ticks.length})`;

    ticksBox.appendChild(ticksTitle);

    if (effect.ticks.length === 0) {

        const empty =
            document.createElement("div");

        empty.className = "no-effects";
        empty.textContent = "— keine —";

        ticksBox.appendChild(empty);

    } else {

        effect.ticks.forEach((tick, index) => {

            ticksBox.appendChild(
                buildTickRow(tick, index, effect.isPercent)
            );
        });
    }

    card.appendChild(ticksBox);

    return card;
}


function buildTickRow(tick, index, isPercent) {

    const row =
        document.createElement("div");

    row.className = "tick-row";

    const countLabel =
        tick.count === null ? "∞" : tick.count;

    const totalCycle =
        tick.preTime + tick.duration + tick.postTime;

    const unit =
        isPercent ? "%" : "";

    row.innerHTML =
        `<div class="tick-index">Tick ${index + 1} · Zyklus ${totalCycle}ms</div>` +
        `<div class="catalog-row"><span>Wert</span><span>${tick.valueChange >= 0 ? "+" : ""}${tick.valueChange}${unit}</span></div>` +
        `<div class="catalog-row"><span>Max</span><span>${tick.maxChange >= 0 ? "+" : ""}${tick.maxChange}${unit}</span></div>` +
        `<div class="catalog-row"><span>Anzahl</span><span>${countLabel}</span></div>` +
        `<div class="catalog-row"><span>preTime</span><span>${tick.preTime}ms</span></div>` +
        `<div class="catalog-row"><span>Dauer</span><span>${tick.duration}ms</span></div>` +
        `<div class="catalog-row"><span>postTime</span><span>${tick.postTime}ms</span></div>`;

    return row;
}


// --------------------------------------------------
// History-Log (System / Effekt) - läuft ins "SYS"-Tab,
// Rest der Chat-Logik lebt komplett in der ChatUI-Klasse.
// --------------------------------------------------

function logSystem(text) {
    chatUI.pushSys("system", "[SYSTEM]", text);
}

function logEffect(text) {
    chatUI.pushSys("effect", "[EFFECT]", text);
}


// --------------------------------------------------
// Standard-Farben je Tag (Ausgangswerte für die
// individuell einstellbaren Reiter-/Chat-Farben).
// --------------------------------------------------

const DEFAULT_TAG_COLOR = {
    ALL: "#8b90a0",
    SYS: "#8b90a0",
    WORLD: "#e0a86c",
    TRADE: "#d9c548",
    AREA: "#d98a3f",
    PARTY: "#6c8cd9",
    CHAT: "#4fb06a",
    EVENT: "#a06cd5",
    ANNOUNCEMENT: "#d9614f",
    ADMIN: "#d4af37"
};

const TAG_LABELS = {
    ALL: "Alle",
    SYS: "System",
    WORLD: "Welt",
    TRADE: "Handel",
    AREA: "Gebiet",
    PARTY: "Party",
    CHAT: "Chat",
    EVENT: "Event",
    ANNOUNCEMENT: "Ankündigung",
    ADMIN: "Admin"
};

function baseTagFor(styleKey) {
    return styleKey.includes("::") ? styleKey.split("::")[0] : styleKey;
}

function defaultStyleFor(styleKey) {

    const tag =
        baseTagFor(styleKey);

    const color =
        DEFAULT_TAG_COLOR[tag] || "#8b90a0";

    return {
        // ALL/SYS sind Übersichts-/Meta-Reiter, kein Blinken
        // standardmäßig nötig.
        blink: tag !== "ALL" && tag !== "SYS",
        blinkSpeed: 900,
        tabTextColor: color,
        tabBgColor: "#1c2027",
        tabBgAlpha: 1,
        tabBorderColor: color,
        chatBgColor: "#12151a",
        chatBgAlpha: 1,
        chatTextColor: "#e4e6ea",
        chatTextAlpha: 1,
        chatBorderColor: color,
        dotOutline: true
    };
}

function hexToRgba(hex, alpha) {

    const clean =
        (hex || "#000000").replace("#", "");

    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SPECIES_COLORS = {
    "Hund": "#c98a3f",
    "Katze": "#a06cd5",
    "Schildkröte": "#4fb06a"
};

function formatTime(timestamp) {

    const date =
        new Date(timestamp);

    return date.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit"
    });
}


// --------------------------------------------------
// ChatUI - kapselt alles rund um den Chat: Reiter,
// Verlauf, Kommandos/Senden, und das Setup-Panel.
// --------------------------------------------------

class ChatUI {

    constructor(dom) {

        this.dom = dom;

        this.chatMessages = [];
        this.sysMessages = [];

        this.visibleTags = new Set(loadFromStorage("chat.visibleTags", ["CHAT", "ANNOUNCEMENT"]));
        this.ungroupedTags = new Set(loadFromStorage("chat.ungroupedTags", ["CHAT"]));
        this.dismissedTags = new Set(loadFromStorage("chat.dismissedTags", []));
        this.dismissedSubtabs = new Set(loadFromStorage("chat.dismissedSubtabs", []));
        this.joinedGroups = new Set(loadFromStorage("chat.joinedGroups", []));
        this.tagStyles = loadFromStorage("chat.tagStyles", {});
        this.showHelp = loadFromStorage("chat.showHelp", true);
        this.showTargetControls = loadFromStorage("chat.showTargetControls", true);
        this.showSysTab = loadFromStorage("chat.showSysTab", false);
        this.beginnerMode = loadFromStorage("chat.beginnerMode", false);

        // Für den Anfänger-Modus: pro Sammel-Tag (EVENT/PARTY/
        // CHAT), welche Untergruppe zuletzt per Klick-Zyklus
        // ausgewählt wurde (Index in getSubgroupsForTag(tag)).
        this.groupCycleIndex = new Map();

        // Eingabe-Verlauf (Pfeiltasten hoch/runter), max. 20.
        this.inputHistory = [];
        this.inputHistoryIndex = -1;
        this.inputDraft = "";
        this.settingsMaximized = false;

        this.activeTabKey = "ALL";
        this.unreadTabs = new Set();
        this.adminActive = false;
        this.lastChatPartnerId = null;
        this.lastGroupTarget = null;
        this.lastEventTarget = null;
        this.lastPartyTarget = null;
        this.activeSendTarget = { type: "world" };
        this.settingsOpen = false;
        this.settingsCategory = "behavior";

        // "standard": Klick auf eine Spieler-Box bereitet auch
        // einen Chat-Send vor. "action": Klicks auf die Boxen
        // betreffen NUR das Zauber-Targeting, Chat bleibt
        // unangetastet.
        this.interactionMode = loadFromStorage("chat.interactionMode", "standard");

        // Debounce für Klick-vs-Doppelklick auf Reiter (siehe
        // bindTabEvents) - verhindert, dass ein Doppelklick
        // durch zwei dazwischenliegende Rerenders "verloren
        // geht" und der Reiter sich stattdessen unerwartet
        // schließt.
        this.pendingTabClickTimer = null;

        this.bindEvents();
        this.applyToggleVisibility();
        this.renderTabs();
        this.renderHistory();
        this.renderLeaveAdminButton();
        this.renderActiveTargetUi();
    }


    // ------------------------------------------------
    // Persistenz
    // ------------------------------------------------

    persist() {
        saveToStorage("chat.visibleTags", [...this.visibleTags]);
        saveToStorage("chat.ungroupedTags", [...this.ungroupedTags]);
        saveToStorage("chat.dismissedTags", [...this.dismissedTags]);
        saveToStorage("chat.dismissedSubtabs", [...this.dismissedSubtabs]);
        saveToStorage("chat.joinedGroups", [...this.joinedGroups]);
        saveToStorage("chat.tagStyles", this.tagStyles);
        saveToStorage("chat.showHelp", this.showHelp);
        saveToStorage("chat.showTargetControls", this.showTargetControls);
        saveToStorage("chat.showSysTab", this.showSysTab);
        saveToStorage("chat.beginnerMode", this.beginnerMode);
        saveToStorage("chat.interactionMode", this.interactionMode);
    }

    getStyle(tagKey) {
        return { ...defaultStyleFor(tagKey), ...(this.tagStyles[tagKey] || {}) };
    }

    setStyle(tagKey, patch) {
        this.tagStyles[tagKey] = { ...this.getStyle(tagKey), ...patch };
        this.persist();
        this.renderTabs();
        this.applyActiveTabStyleToPanel();
    }

    applyToggleVisibility() {
        this.dom.hint.classList.toggle("hidden", !this.showHelp);
        this.dom.scopeRow.classList.toggle("hidden", !this.showTargetControls);
    }


    // ------------------------------------------------
    // Eingehende Chat-Nachrichten
    // ------------------------------------------------

    onChat(message) {

        const isSelf =
            message.from === selfId;

        const entry = {
            tag: message.tag,
            groupName: message.groupName,
            targets: message.targets,
            fromId: message.from,
            fromName: message.fromName,
            fromSpecies: message.fromSpecies,
            fromAdmin: message.fromAdmin,
            text: message.text,
            timestamp: message.timestamp,
            isSelf
        };

        this.chatMessages.push(entry);

        // Für ":r" merken, wer einem zuletzt PRIVAT geschrieben
        // hat (nicht man selbst).
        if (entry.tag === "CHAT" && !isSelf) {
            this.lastChatPartnerId = entry.fromId;
        }

        if (entry.groupName && (entry.tag === "EVENT" || entry.tag === "PARTY")) {
            this.joinedGroups.add(entry.groupName.toLowerCase());
        }

        if (message.tag === "ADMIN") {
            this.adminActive = true;
        }

        if (!this.visibleTags.has(entry.tag) && !this.dismissedTags.has(entry.tag)) {
            this.visibleTags.add(entry.tag);
            this.persist();
        }

        const tabKey =
            this.tabKeyForEntry(entry);

        if (this.dismissedSubtabs.has(tabKey)) {
            return;
        }

        // Eigene, selbst gesendete Nachrichten sollen den Reiter
        // NICHT zum Blinken bringen - nur fremde Nachrichten.
        if (tabKey !== this.activeTabKey && !isSelf) {
            this.unreadTabs.add(tabKey);
        }

        this.renderTabs();
        this.renderLeaveAdminButton();

        if (tabKey === this.activeTabKey || this.activeTabKey === "ALL") {
            this.renderHistory();
        }
    }


    pushSys(cssClass, tag, text) {

        this.sysMessages.push({
            cssClass,
            tag,
            text,
            timestamp: Date.now()
        });

        if (this.activeTabKey !== "SYS") {
            this.unreadTabs.add("SYS");
            this.renderTabs();
        } else {
            this.renderHistory();
        }
    }


    // ------------------------------------------------
    // Gruppierung / Unter-Reiter
    // ------------------------------------------------

    tabKeyForEntry(entry) {

        if (!this.ungroupedTags.has(entry.tag)) {
            return entry.tag;
        }

        return `${entry.tag}::${this.subgroupKeyForEntry(entry)}`;
    }

    subgroupKeyForEntry(entry) {

        if (entry.tag === "CHAT") {

            const participants =
                (entry.targets || [])
                    .concat(entry.isSelf ? [] : [entry.fromId])
                    .filter((id) => id !== selfId);

            if (participants.length === 0) {
                return String(entry.fromId);
            }

            return [...new Set(participants)].sort((a, b) => a - b).join(",");
        }

        return entry.groupName || "allgemein";
    }

    subgroupLabelForKey(tag, subKey) {

        if (tag === "CHAT") {

            const names =
                subKey
                    .split(",")
                    .map((id) => players.get(Number(id))?.name ?? `#${id}`);

            return names.join(", ");
        }

        return `${TAG_LABELS[tag] ?? tag}.${subKey}`;
    }

    getSubgroupsForTag(tag) {

        const seen = new Map();

        for (const entry of this.chatMessages) {

            if (entry.tag !== tag) {
                continue;
            }

            const subKey =
                this.subgroupKeyForEntry(entry);

            if (this.dismissedSubtabs.has(`${tag}::${subKey}`)) {
                continue;
            }

            if (!seen.has(subKey)) {
                seen.set(subKey, this.subgroupLabelForKey(tag, subKey));
            }
        }

        return [...seen.entries()];
    }


    // ------------------------------------------------
    // Reiter (Tabs)
    // ------------------------------------------------

    computeTabList() {

        const tabs = [
            { key: "ALL", label: "Alle" }
        ];

        if (this.showSysTab) {
            tabs.push({ key: "SYS", label: "System" });
        }

        for (const tag of this.visibleTags) {

            if (this.ungroupedTags.has(tag)) {

                for (const [subKey, label] of this.getSubgroupsForTag(tag)) {

                    tabs.push({
                        key: `${tag}::${subKey}`,
                        label,
                        tag,
                        subKey,
                        closable: true
                    });
                }

            } else {

                tabs.push({
                    key: tag,
                    label: TAG_LABELS[tag] ?? tag,
                    tag,
                    closable: true
                });
            }
        }

        return tabs;
    }

    renderTabs() {

        this.dom.tabs.innerHTML = "";

        const tabs =
            this.computeTabList();

        // Der aktive Reiter gilt auch dann als gültig, wenn er
        // eine "virtuelle" Untergruppe eines noch zusammen-
        // gefassten (nicht aufgelösten) Sammel-Reiters ist - das
        // passiert beim Durchklicken/Zyklen (siehe
        // cycleThroughCombinedTab), ohne dass dafür eigene
        // Unter-Reiter existieren müssen.
        const activeTabStillValid =
            tabs.some((tab) => tab.key === this.activeTabKey) ||
            this.activeTabKey === this.describeActiveTargetTabKey() ||
            (
                this.activeTabKey.includes("::") &&
                tabs.some((tab) => tab.key === this.activeTabKey.split("::")[0])
            );

        if (!activeTabStillValid) {
            this.activeTabKey = "ALL";
        }

        for (const tab of tabs) {

            const styleKey = tab.key;
            const style = this.getStyle(styleKey);

            const el =
                document.createElement("div");

            // Ein zusammengefasster (nicht aufgelöster) Sammel-
            // Reiter (z.B. "Event") gilt auch dann als "aktiv
            // betrachtet", wenn man gerade eine seiner virtuellen
            // Untergruppen durchklickt/zyklt (z.B. "EVENT::G2") -
            // sonst würde der Rahmen beim Durchklicken verschwinden,
            // obwohl man sich klar erkennbar in diesem Bereich
            // befindet.
            const isActiveView =
                tab.key === this.activeTabKey ||
                (
                    !tab.subKey &&
                    tab.tag &&
                    this.activeTabKey.startsWith(`${tab.tag}::`)
                );

            const isBlinking =
                this.unreadTabs.has(tab.key) && style.blink;

            el.className =
                "chat-tab" +
                (isActiveView ? " active" : "") +
                (this.unreadTabs.has(tab.key) ? " unread" : "") +
                (isBlinking ? " blinking" : "") +
                (tab.tag === "ADMIN" ? " admin-tab" : "");

            el.style.setProperty("--tag-color", style.tabTextColor);
            el.style.color = style.tabTextColor;
            el.style.background = hexToRgba(style.tabBgColor, style.tabBgAlpha);
            el.style.borderColor = isActiveView ? style.tabBorderColor : "var(--line)";

            if (isBlinking) {
                el.style.animationDuration = `${style.blinkSpeed}ms`;
            }

            const isActiveTarget =
                this.describeActiveTargetTabKey() === tab.key;

            // Solange man beim Durchklicken/Zyklen gerade eine
            // Untergruppe eines noch zusammengefassten Sammel-
            // Reiters betrachtet, den Namen dieser Untergruppe
            // mit anzeigen (z.B. "Event (G2)"), damit klar ist,
            // welche konkret gerade offen ist.
            let displayLabel = tab.label;

            if (!tab.subKey && tab.tag && this.activeTabKey.startsWith(`${tab.tag}::`)) {

                const activeSubKey =
                    this.activeTabKey.split("::")[1];

                const activeSubLabel =
                    this.subgroupLabelForKey(tab.tag, activeSubKey);

                displayLabel = `${tab.label} (${activeSubLabel})`;
            }

            el.innerHTML =
                `<span class="tab-dot${style.dotOutline ? " outlined" : ""}"></span>` +
                `<span>${escapeHtml(displayLabel)}</span>` +
                (isActiveTarget ? `<span class="active-marker" title="Aktuelles Sende-Ziel: hier landet deine nächste Nachricht">●</span>` : "") +
                (tab.closable ? `<span class="tab-close">✕</span>` : "");

            // Klick UND Doppelklick auf demselben Reiter: der
            // Browser feuert bei einem Doppelklick trotzdem
            // ZWEI "click"-Events, bevor "dblclick" kommt. Ohne
            // Verzögerung baut jeder Klick sofort die ganze
            // Reiterleiste neu auf (renderTabs()), wodurch das
            // Element unter der Maus mitten in der Geste durch
            // ein frisches ersetzt wird - das hat gelegentlich
            // dazu geführt, dass der zweite Klick auf das "x"
            // statt den Reiter selbst trifft und der Reiter sich
            // scheinbar "von selbst" schließt. Fix: der einfache
            // Klick wartet kurz, ein währenddessen eintreffender
            // Doppelklick bricht ihn ab.
            el.addEventListener("click", (event) => {

                if (event.target.classList.contains("tab-close")) {
                    return;
                }

                // Strg/Cmd+Klick auf einen Reiter, in den man
                // auch schreiben darf: fügt einen klickbaren
                // Link zu diesem Chat ins Eingabefeld ein, statt
                // die Ansicht zu wechseln.
                if ((event.ctrlKey || event.metaKey) && tab.tag && this.canWriteToTag(tab.tag)) {

                    const token =
                        this.buildLinkToken(tab);

                    if (token) {
                        this.insertLinkToken(token);
                    }

                    return;
                }

                clearTimeout(this.pendingTabClickTimer);

                this.pendingTabClickTimer = setTimeout(() => {
                    this.handleTabClick(tab);
                }, 250);
            });

            if (tab.tag) {

                el.addEventListener("dblclick", (event) => {

                    event.preventDefault();

                    clearTimeout(this.pendingTabClickTimer);
                    this.pendingTabClickTimer = null;

                    // Die betrachtete Ansicht soll durch das
                    // Auf-/Zuklappen NICHT verändert werden -
                    // außer der gerade zusammengeklappte
                    // Sammel-Reiter war aktiv (dann auf den
                    // ersten Unter-Reiter wechseln) oder einer
                    // der Unter-Reiter war aktiv, die jetzt
                    // wieder zusammengefasst werden (dann auf
                    // den Sammel-Reiter wechseln).
                    const wasViewingCombined =
                        this.activeTabKey === tab.tag;

                    const wasViewingSubtabOfThisTag =
                        this.activeTabKey.startsWith(`${tab.tag}::`);

                    if (this.ungroupedTags.has(tab.tag)) {

                        // War aufgelöst -> jetzt zusammenklappen.
                        this.ungroupedTags.delete(tab.tag);

                        if (wasViewingSubtabOfThisTag) {
                            this.activeTabKey = tab.tag;
                        }

                    } else {

                        // War zusammengefasst -> jetzt auflösen.
                        this.ungroupedTags.add(tab.tag);

                        if (wasViewingCombined) {

                            const subs =
                                this.getSubgroupsForTag(tab.tag);

                            this.activeTabKey =
                                subs.length > 0
                                    ? `${tab.tag}::${subs[0][0]}`
                                    : tab.tag;
                        }
                    }

                    this.persist();

                    this.renderTabs();
                    this.renderHistory();
                });
            }

            if (tab.closable) {

                const closeEl =
                    el.querySelector(".tab-close");

                closeEl.addEventListener("click", (event) => {

                    event.stopPropagation();
                    clearTimeout(this.pendingTabClickTimer);

                    if (tab.key.includes("::")) {

                        this.dismissedSubtabs.add(tab.key);

                        const [tag, subKey] = tab.key.split("::");

                        if (tag === "EVENT" || tag === "PARTY") {
                            this.joinedGroups.delete(subKey.toLowerCase());
                        }

                    } else if (tab.tag) {

                        this.visibleTags.delete(tab.tag);
                        this.dismissedTags.add(tab.tag);
                    }

                    this.persist();

                    if (this.activeTabKey === tab.key) {
                        this.activeTabKey = "ALL";
                    }

                    this.renderTabs();
                    this.renderHistory();
                });
            }

            this.dom.tabs.appendChild(el);
        }

        // Aktives Sende-Ziel + "..." Setup-Button ganz rechts.
        const label =
            document.createElement("span");

        label.className = "chat-active-target-label";
        label.innerHTML =
            `<span>${escapeHtml(this.describeActiveTarget())}</span>` +
            (this.activeSendTarget.type !== "world" ? `<span class="clear-target">✕</span>` : "");

        const clearEl =
            label.querySelector(".clear-target");

        if (clearEl) {

            clearEl.addEventListener("click", () => {
                this.setActiveTarget({ type: "world" });
            });
        }

        this.dom.tabs.appendChild(label);

        const settingsButton =
            document.createElement("button");

        settingsButton.type = "button";
        settingsButton.className = "chat-settings-btn";
        settingsButton.textContent = "···";
        settingsButton.title = "Reiter einstellen";

        settingsButton.addEventListener("click", () => {
            this.settingsOpen = !this.settingsOpen;
            this.dom.settingsPanel.classList.toggle("open", this.settingsOpen);
            if (this.settingsOpen) {
                this.renderSettingsPanel();
            }
        });

        this.dom.tabs.appendChild(settingsButton);

        this.applyActiveTabStyleToPanel();
    }

    applyActiveTabStyleToPanel() {

        const style =
            this.getStyle(this.activeTabKey);

        this.dom.panel.style.setProperty("--active-chat-bg", hexToRgba(style.chatBgColor, style.chatBgAlpha));
        this.dom.panel.style.setProperty("--active-chat-text", hexToRgba(style.chatTextColor, style.chatTextAlpha));
        this.dom.panel.style.setProperty("--active-border", style.chatBorderColor);
    }


    // ------------------------------------------------
    // Setup-Panel (Reiter individuell gestalten)
    // ------------------------------------------------

    renderSettingsPanel() {

        this.dom.settingsPanel.innerHTML = "";
        this.dom.settingsPanel.classList.toggle("maximized", this.settingsMaximized);

        const maximizeButton =
            document.createElement("button");

        maximizeButton.type = "button";
        maximizeButton.className = "maximize-btn";
        maximizeButton.textContent = this.settingsMaximized ? "⤡ Verkleinern" : "⛶ Vergrößern";
        maximizeButton.title = "Setup mittig/groß anzeigen";

        maximizeButton.addEventListener("click", () => {
            this.settingsMaximized = !this.settingsMaximized;
            this.renderSettingsPanel();
        });

        this.dom.settingsPanel.appendChild(maximizeButton);

        const toggles =
            document.createElement("div");

        toggles.className = "chat-settings-toggles";

        const helpLabel = document.createElement("label");
        const helpCheckbox = document.createElement("input");
        helpCheckbox.type = "checkbox";
        helpCheckbox.checked = this.showHelp;
        helpCheckbox.addEventListener("change", () => {
            this.showHelp = helpCheckbox.checked;
            this.persist();
            this.applyToggleVisibility();
        });
        helpLabel.appendChild(helpCheckbox);
        helpLabel.appendChild(document.createTextNode("Hilfe-Zeile anzeigen"));

        const targetLabel = document.createElement("label");
        const targetCheckbox = document.createElement("input");
        targetCheckbox.type = "checkbox";
        targetCheckbox.checked = this.showTargetControls;
        targetCheckbox.addEventListener("change", () => {
            this.showTargetControls = targetCheckbox.checked;
            this.persist();
            this.applyToggleVisibility();
        });
        targetLabel.appendChild(targetCheckbox);
        targetLabel.appendChild(document.createTextNode("Spieler-/Gruppenauswahl anzeigen"));

        const sysLabel = document.createElement("label");
        const sysCheckbox = document.createElement("input");
        sysCheckbox.type = "checkbox";
        sysCheckbox.checked = this.showSysTab;
        sysCheckbox.addEventListener("change", () => {
            this.showSysTab = sysCheckbox.checked;
            this.persist();
            this.renderTabs();
            this.renderHistory();
        });
        sysLabel.appendChild(sysCheckbox);
        sysLabel.appendChild(document.createTextNode("System-Reiter anzeigen"));

        toggles.appendChild(helpLabel);
        toggles.appendChild(targetLabel);
        toggles.appendChild(sysLabel);

        // Standard-/Action-Modus (betrifft das Klicken der
        // Spieler-Boxen, siehe Player-Box-Click-Handler) - eine
        // einzelne Checkbox statt zweier Radio-Buttons.
        const modeLabel = document.createElement("label");
        const modeCheckbox = document.createElement("input");
        modeCheckbox.type = "checkbox";
        modeCheckbox.checked = this.interactionMode === "action";
        modeCheckbox.addEventListener("change", () => {
            this.interactionMode = modeCheckbox.checked ? "action" : "standard";
            this.persist();
        });
        modeLabel.appendChild(modeCheckbox);
        modeLabel.appendChild(document.createTextNode(
            "Action-Modus (Klick auf Spieler betrifft nur Zauber, kein Chat)"
        ));
        toggles.appendChild(modeLabel);

        // Anfänger-Modus: jeder Reiter-Klick aktiviert auch
        // gleich das Sende-Ziel + Ansicht (statt nur bei
        // bestimmten Reitern / Dropdown-Auswahl).
        const beginnerLabel = document.createElement("label");
        const beginnerCheckbox = document.createElement("input");
        beginnerCheckbox.type = "checkbox";
        beginnerCheckbox.checked = this.beginnerMode;
        beginnerCheckbox.addEventListener("change", () => {
            this.beginnerMode = beginnerCheckbox.checked;
            this.persist();
        });
        beginnerLabel.appendChild(beginnerCheckbox);
        beginnerLabel.appendChild(document.createTextNode(
            "Anfänger-Modus (jeder Reiter-Klick + jede Auswahl aktiviert sofort Ziel + Ansicht)"
        ));
        toggles.appendChild(beginnerLabel);

        this.dom.settingsPanel.appendChild(toggles);


        const visibilityRow =
            document.createElement("div");

        visibilityRow.className = "chat-settings-toggles";

        for (const tag of Object.keys(TAG_LABELS)) {

            if (tag === "ALL" || tag === "SYS") {
                continue;
            }

            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.visibleTags.has(tag);
            checkbox.addEventListener("change", () => {

                if (checkbox.checked) {
                    this.visibleTags.add(tag);
                    this.dismissedTags.delete(tag);
                } else {
                    this.visibleTags.delete(tag);
                    this.dismissedTags.add(tag);
                }

                this.persist();
                this.renderTabs();
                this.renderHistory();
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(TAG_LABELS[tag]));
            visibilityRow.appendChild(label);
        }

        this.dom.settingsPanel.appendChild(visibilityRow);


        // Kategorien - statt einer riesigen Tabelle mit allen
        // Spalten auf einmal, ein kompakter Reiter pro Bereich
        // (Reiter-Rahmen, Reiter-Hintergrund, Chat-Rahmen,
        // Chat-Hintergrund, Blinken, Sonstiges).
        const categories = [
            { key: "behavior", label: "Blinken" },
            { key: "tabColors", label: "Reiter-Farben" },
            { key: "tabBorder", label: "Reiter-Rahmen" },
            { key: "chatColors", label: "Chat-Hintergrund" },
            { key: "chatBorder", label: "Chat-Rahmen" },
            { key: "misc", label: "Sonstiges" }
        ];

        const categoryRow =
            document.createElement("div");

        categoryRow.className = "chat-settings-toggles";

        for (const cat of categories) {

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = cat.label;
            button.className = "chat-settings-btn";

            if (cat.key === this.settingsCategory) {
                button.style.borderColor = "var(--accent)";
                button.style.color = "var(--text)";
            }

            button.addEventListener("click", () => {
                this.settingsCategory = cat.key;
                this.renderSettingsPanel();
            });

            categoryRow.appendChild(button);
        }

        this.dom.settingsPanel.appendChild(categoryRow);


        const table =
            document.createElement("table");

        table.className = "chat-style-table";

        table.innerHTML = this.styleTableHeaderFor(this.settingsCategory);

        const tbody =
            document.createElement("tbody");

        for (const row of this.getSettingsRows()) {
            tbody.appendChild(this.buildStyleRow(row.key, row.label, this.settingsCategory));
        }

        table.appendChild(tbody);
        this.dom.settingsPanel.appendChild(table);
    }

    // Alle aktuell existierenden Reiter (auch aufgelöste, z.B.
    // eine bestimmte private Unterhaltung mit Spieler 5) PLUS
    // die Basis-Tags, die man vorab stylen kann, auch wenn sie
    // gerade nicht sichtbar/aktiv sind.
    getSettingsRows() {

        const tabs =
            this.computeTabList();

        const rows =
            tabs.map((t) => ({ key: t.key, label: t.label }));

        for (const tag of Object.keys(TAG_LABELS)) {

            if (tag === "ALL" || tag === "SYS") {
                continue;
            }

            const alreadyRepresented =
                rows.some((r) => r.key === tag || r.key.startsWith(`${tag}::`));

            if (!alreadyRepresented) {
                rows.push({ key: tag, label: `${TAG_LABELS[tag]} (Standard)` });
            }
        }

        return rows;
    }

    styleTableHeaderFor(category) {

        const columns = {
            behavior: ["Blink", "Geschw."],
            tabColors: ["Text", "Hintergrund", "Deckkraft"],
            tabBorder: ["Rahmenfarbe"],
            chatColors: ["Chat-BG", "Deckkr.", "Chat-Text", "Deckkr."],
            tabBorder2: [],
            chatBorder: ["Chat-Rahmenfarbe"],
            misc: ["Punkt schwarz umrandet"]
        }[category] || [];

        return (
            `<thead><tr><th>Reiter</th>` +
            columns.map((c) => `<th>${c}</th>`).join("") +
            `</tr></thead>`
        );
    }

    buildStyleRow(tagKey, label, category) {

        const style =
            this.getStyle(tagKey);

        const row =
            document.createElement("tr");

        const cell = (el) => {
            const td = document.createElement("td");
            td.appendChild(el);
            return td;
        };

        const nameCell = document.createElement("td");
        nameCell.textContent = label;
        row.appendChild(nameCell);

        const makeColor = (value, onChange) => {
            const input = document.createElement("input");
            input.type = "color";
            input.value = value;
            input.addEventListener("input", () => onChange(input.value));
            return input;
        };

        const makeAlpha = (value, onChange) => {
            const input = document.createElement("input");
            input.type = "range";
            input.min = "0";
            input.max = "100";
            input.value = String(Math.round(value * 100));
            input.addEventListener("input", () => onChange(Number(input.value) / 100));
            return input;
        };

        if (category === "behavior") {

            const blinkCheckbox = document.createElement("input");
            blinkCheckbox.type = "checkbox";
            blinkCheckbox.checked = style.blink;
            blinkCheckbox.addEventListener("change", () => this.setStyle(tagKey, { blink: blinkCheckbox.checked }));
            row.appendChild(cell(blinkCheckbox));

            const speedInput = document.createElement("input");
            speedInput.type = "range";
            speedInput.min = "200";
            speedInput.max = "3000";
            speedInput.step = "100";
            speedInput.value = String(style.blinkSpeed);
            speedInput.addEventListener("input", () => this.setStyle(tagKey, { blinkSpeed: Number(speedInput.value) }));
            row.appendChild(cell(speedInput));

        } else if (category === "tabColors") {

            row.appendChild(cell(makeColor(style.tabTextColor, (v) => this.setStyle(tagKey, { tabTextColor: v }))));
            row.appendChild(cell(makeColor(style.tabBgColor, (v) => this.setStyle(tagKey, { tabBgColor: v }))));
            row.appendChild(cell(makeAlpha(style.tabBgAlpha, (v) => this.setStyle(tagKey, { tabBgAlpha: v }))));

        } else if (category === "tabBorder") {

            row.appendChild(cell(makeColor(style.tabBorderColor, (v) => this.setStyle(tagKey, { tabBorderColor: v }))));

        } else if (category === "chatColors") {

            row.appendChild(cell(makeColor(style.chatBgColor, (v) => this.setStyle(tagKey, { chatBgColor: v }))));
            row.appendChild(cell(makeAlpha(style.chatBgAlpha, (v) => this.setStyle(tagKey, { chatBgAlpha: v }))));
            row.appendChild(cell(makeColor(style.chatTextColor, (v) => this.setStyle(tagKey, { chatTextColor: v }))));
            row.appendChild(cell(makeAlpha(style.chatTextAlpha, (v) => this.setStyle(tagKey, { chatTextAlpha: v }))));

        } else if (category === "chatBorder") {

            row.appendChild(cell(makeColor(style.chatBorderColor, (v) => this.setStyle(tagKey, { chatBorderColor: v }))));

        } else if (category === "misc") {

            const dotCheckbox = document.createElement("input");
            dotCheckbox.type = "checkbox";
            dotCheckbox.checked = style.dotOutline;
            dotCheckbox.addEventListener("change", () => this.setStyle(tagKey, { dotOutline: dotCheckbox.checked }));
            row.appendChild(cell(dotCheckbox));
        }

        return row;
    }


    renderLeaveAdminButton() {

        this.dom.leaveAdminButton.classList.toggle("visible", this.adminActive);
        this.dom.panel.classList.toggle("admin-active", this.adminActive);
    }


    // ------------------------------------------------
    // Verlauf
    // ------------------------------------------------

    messagesForActiveTab() {

        if (this.activeTabKey === "ALL") {
            return this.chatMessages;
        }

        if (this.activeTabKey.includes("::")) {

            const [tag, subKey] = this.activeTabKey.split("::");

            return this.chatMessages.filter(
                (entry) => entry.tag === tag && this.subgroupKeyForEntry(entry) === subKey
            );
        }

        return this.chatMessages.filter((entry) => entry.tag === this.activeTabKey);
    }

    buildChatLine(entry) {

        const line =
            document.createElement("div");

        line.className = "log-line";

        const tagLabel =
            entry.groupName
                ? `[${entry.tag}.${escapeHtml(entry.groupName)}]`
                : `[${entry.tag}]`;

        const nameColor =
            SPECIES_COLORS[entry.fromSpecies] ?? "inherit";

        const displayName =
            entry.isSelf ? "Du" : entry.fromName;

        const adminBadge =
            entry.fromAdmin ? `<span class="admin-badge">🛡️</span>` : "";

        line.innerHTML =
            `<span class="msg-time">${formatTime(entry.timestamp)}</span>` +
            `<span class="tag" data-tag="${entry.tag}" data-groupname="${entry.groupName ?? ""}">${tagLabel}</span>` +
            `${adminBadge}` +
            `<span class="msg-name" data-from-id="${entry.fromId}" style="color:${nameColor}">${escapeHtml(displayName)}</span>: ` +
            `${this.linkifyMessageText(entry.text)}`;

        return line;
    }

    renderSysHistory() {

        this.dom.history.innerHTML = "";

        for (const entry of this.sysMessages) {

            const line =
                document.createElement("div");

            line.className = "log-line";

            line.innerHTML =
                `<span class="msg-time">${formatTime(entry.timestamp)}</span>` +
                `<span class="tag ${entry.cssClass}">${entry.tag}</span>` +
                `${escapeHtml(entry.text)}`;

            this.dom.history.appendChild(line);
        }

        this.dom.history.scrollTop = this.dom.history.scrollHeight;
    }

    renderHistory() {

        this.applyActiveTabStyleToPanel();

        if (this.activeTabKey === "SYS") {
            this.renderSysHistory();
            return;
        }

        const entries =
            this.messagesForActiveTab();

        this.dom.history.innerHTML = "";

        for (const entry of entries) {
            this.dom.history.appendChild(this.buildChatLine(entry));
        }

        this.dom.history.scrollTop = this.dom.history.scrollHeight;
    }


    // ------------------------------------------------
    // Aktives Sende-Ziel ("vorbereiteter Send")
    // ------------------------------------------------

    describeActiveTarget() {

        const t = this.activeSendTarget;

        if (t.type === "world") return "Welt";
        if (t.type === "trade") return "Handel";
        if (t.type === "area") return "Gebiet";
        if (t.type === "admin") return "SpielAdmin";
        if (t.type === "announcement") return "Ankündigung";
        if (t.type === "private") return `→ ${t.targetName}`;
        if (t.type === "private-multi") return `→ ${t.targetIds.length} Spieler`;
        if (t.type === "group") return `${t.groupType === "party" ? "PARTY" : "EVENT"}.${t.groupName}`;

        return "Welt";
    }

    describeActiveTargetTabKey() {

        const t = this.activeSendTarget;

        if (t.type === "admin") return "ADMIN";
        if (t.type === "trade") return "TRADE";
        if (t.type === "area") return "AREA";
        if (t.type === "announcement") return "ANNOUNCEMENT";
        if (t.type === "world") return "WORLD";

        if (t.type === "group") {
            return `${t.groupType === "party" ? "PARTY" : "EVENT"}::${t.groupName}`;
        }

        if (t.type === "private") {
            return `CHAT::${t.targetId}`;
        }

        if (t.type === "private-multi") {
            return `CHAT::${[...t.targetIds].sort((a, b) => a - b).join(",")}`;
        }

        return null;
    }

    // Macht sicher, dass der zu einem Ziel gehörende Tag als
    // Reiter sichtbar ist (z.B. wenn man ":r"/"::"/"@" nutzt,
    // bevor überhaupt eine Nachricht in diesem Kanal da war).
    ensureTagVisible(tag) {

        if (!this.visibleTags.has(tag) && !this.dismissedTags.has(tag)) {
            this.visibleTags.add(tag);
            this.persist();
        }
    }

    // "Alle" und "System" sind reine Übersichts-/Log-Ansichten,
    // kein eigener Sende-Kanal. "Ankündigung" darf nur ein Admin
    // beschreiben. Alles andere ist normal beschreibbar.
    canWriteToTag(tag) {

        if (tag === "ALL" || tag === "SYS") {
            return false;
        }

        if (tag === "ANNOUNCEMENT") {
            return selfIsAdmin;
        }

        return true;
    }

    // switchView=true (Standard): wechselt sofort auch die
    // sichtbare Ansicht passend zum neuen Ziel (so wie es die
    // Text-Kommandos ":p"/"::"/"@" und Klicks auf Reiter/Namen
    // tun sollen). switchView=false: ändert NUR das Sende-Ziel,
    // die aktuell betrachtete Ansicht bleibt unangetastet - das
    // ist das Standardverhalten der Dropdown-Auswahl unten
    // ("Schalter"), außer im Anfänger-Modus.
    //
    // "Alle" ist rein eine Navigations-Ansicht (zeigt wirklich
    // alles) und wird NIE automatisch durch das Setzen eines
    // Ziels ausgelöst - auch "Welt" wechselt jetzt konsequent
    // zum WELT-Reiter, genau wie jedes andere Ziel auch.
    setActiveTarget(target, { switchView = true } = {}) {

        this.activeSendTarget = target;

        if (target.type === "group") {

            // Für "/g" (letzte Gruppe/Event) sowie "/e" und "/p"
            // (letztes Event bzw. letzte Party jeweils spezifisch)
            // gemerkt, unabhängig davon, was gerade sonst noch
            // als Ziel aktiv ist.
            this.lastGroupTarget = { groupType: target.groupType, groupName: target.groupName };

            if (target.groupType === "party") {
                this.lastPartyTarget = { groupName: target.groupName };
            } else {
                this.lastEventTarget = { groupName: target.groupName };
            }
        }

        const tag =
            target.type === "group" ? (target.groupType === "party" ? "PARTY" : "EVENT")
            : target.type === "trade" ? "TRADE"
            : target.type === "area" ? "AREA"
            : target.type === "admin" ? "ADMIN"
            : target.type === "announcement" ? "ANNOUNCEMENT"
            : target.type === "world" ? "WORLD"
            : target.type === "private" || target.type === "private-multi" ? "CHAT"
            : null;

        if (tag) {
            this.ensureTagVisible(tag);
        }

        if (switchView) {

            const tabKey =
                this.describeActiveTargetTabKey();

            if (tabKey) {
                this.activeTabKey = tabKey;
                this.unreadTabs.delete(tabKey);
            }
        }

        this.renderActiveTargetUi();
        this.renderTabs();
        this.renderHistory();
    }

    // Ermittelt den Style-Schlüssel (wie ein Tab-Key), der zum
    // aktuell aktiven Sende-Ziel passt - damit das Eingabefeld
    // in genau der Farbe des jeweiligen Kanals aufleuchtet.
    // "Alle" ist nur ein Anzeige-Begriff (zeigt ALLES an), kein
    // eigener Sende-Kanal - farblich zählt hier die Welt-Farbe.
    activeTargetStyleKey() {

        const key =
            this.describeActiveTargetTabKey();

        return key ?? "WORLD";
    }

    renderActiveTargetUi() {

        const isDefault =
            this.activeSendTarget.type === "world";

        this.dom.input.classList.toggle("target-prepared", !isDefault);

        const style =
            this.getStyle(this.activeTargetStyleKey());

        this.dom.input.style.borderColor = style.tabTextColor;
        this.dom.input.style.background = hexToRgba(style.tabTextColor, isDefault ? 0.06 : 0.14);
    }

    // switchView:false überall hier - die Ansicht (activeTabKey)
    // wurde vom Aufrufer (handleTabClick/cycleThroughCombinedTab)
    // schon korrekt gesetzt, bevor diese Methode läuft.
    activateTabAsTarget(tab) {

        if (tab.key === "ALL") {
            this.setActiveTarget({ type: "world" }, { switchView: false });
            return;
        }

        if (tab.tag === "ADMIN") {
            this.setActiveTarget({ type: "admin" }, { switchView: false });
            return;
        }

        if (tab.tag === "WORLD") {
            this.setActiveTarget({ type: "world" }, { switchView: false });
            return;
        }

        if (tab.tag === "TRADE") {
            this.setActiveTarget({ type: "trade" }, { switchView: false });
            return;
        }

        if (tab.tag === "AREA") {
            this.setActiveTarget({ type: "area" }, { switchView: false });
            return;
        }

        if (tab.tag === "ANNOUNCEMENT") {
            this.setActiveTarget({ type: "announcement" }, { switchView: false });
            return;
        }

        if ((tab.tag === "EVENT" || tab.tag === "PARTY") && tab.subKey) {

            this.setActiveTarget({
                type: "group",
                groupType: tab.tag === "PARTY" ? "party" : "event",
                groupName: tab.subKey
            }, { switchView: false });

            return;
        }

        if (tab.tag === "CHAT" && tab.subKey) {

            const ids = tab.subKey.split(",").map(Number);

            if (ids.length === 1) {

                this.setActiveTarget({
                    type: "private",
                    targetId: ids[0],
                    targetName: players.get(ids[0])?.name ?? `#${ids[0]}`
                }, { switchView: false });

            } else {

                this.setActiveTarget({ type: "private-multi", targetIds: ids }, { switchView: false });
            }
        }

        // AREA und die zusammengefassten (nicht aufgelösten)
        // EVENT/PARTY-Sammel-Reiter: kein eindeutiges Ziel
        // ableitbar (welche Gruppe genau?) - kein sinnvolles
        // "Ziel" zum Zurückschreiben - Ansicht wechselt, aber
        // das Sende-Ziel bleibt unangetastet.
    }

    // Experten-Modus (Standard): ein einfacher Klick auf EINEN
    // Reiter bedeutet IMMER nur "Nachrichtenfenster ansehen",
    // nie das Sende-Ziel wechseln - egal welcher Reiter (auch
    // "Alle" und "Admin" nicht, keine Sonderbehandlung mehr).
    //
    // Anfänger-Modus: jeder Klick aktiviert auch das Ziel. Bei
    // einem zusammengefassten Sammel-Reiter (z.B. "Event", der
    // mehrere Gruppen wie G2/G3/G4 bündelt) wird dabei bei
    // jedem weiteren Klick zur NÄCHSTEN Untergruppe
    // weitergeschaltet (der Reihe nach, mit Umlauf am Ende).
    // Experten-Modus: einfacher Klick wechselt IMMER nur die
    // Ansicht, nie das Sende-Ziel - das gilt auch für einen
    // zusammengefassten Sammel-Reiter: der zyklt beim Klicken
    // trotzdem durch seine Untergruppen (nur eben ohne dabei
    // das Ziel zu wechseln). Anfänger-Modus: zusätzlich wird
    // dabei auch gleich das Sende-Ziel aktiviert.
    handleTabClick(tab) {

        const isCombinedGroupTab =
            !tab.subKey &&
            (tab.tag === "EVENT" || tab.tag === "PARTY" || tab.tag === "CHAT") &&
            this.getSubgroupsForTag(tab.tag).length > 0;

        if (isCombinedGroupTab) {
            this.cycleThroughCombinedTab(tab, this.beginnerMode);
            return;
        }

        this.activeTabKey = tab.key;
        this.unreadTabs.delete(tab.key);

        if (this.beginnerMode) {
            this.activateTabAsTarget(tab);
        } else {
            this.renderTabs();
            this.renderHistory();
        }
    }

    cycleThroughCombinedTab(tab, alsoActivateTarget) {

        const subs =
            this.getSubgroupsForTag(tab.tag);

        const currentIndex =
            this.groupCycleIndex.get(tab.tag) ?? -1;

        const nextIndex =
            (currentIndex + 1) % subs.length;

        this.groupCycleIndex.set(tab.tag, nextIndex);

        const [subKey] = subs[nextIndex];
        const subTabKey = `${tab.tag}::${subKey}`;

        this.activeTabKey = subTabKey;
        this.unreadTabs.delete(subTabKey);

        if (alsoActivateTarget) {
            this.activateTabAsTarget({ tag: tab.tag, subKey, key: subTabKey });
        } else {
            this.renderTabs();
            this.renderHistory();
        }
    }

    // Baut ein einfügbares "Link"-Token für einen Reiter, in den
    // man auch schreiben darf (Strg/Cmd+Klick auf den Reiter).
    // Andere Spieler, die auf diesen Link im Chat klicken,
    // aktivieren damit denselben Kanal bei sich.
    buildLinkToken(tab) {

        if (!tab.tag || !this.canWriteToTag(tab.tag)) {
            return null;
        }

        if (tab.tag === "WORLD" || tab.tag === "TRADE" || tab.tag === "AREA" || tab.tag === "ADMIN" || tab.tag === "ANNOUNCEMENT") {
            return `[[${tab.tag}]]`;
        }

        if ((tab.tag === "EVENT" || tab.tag === "PARTY") && tab.subKey) {
            return `[[${tab.tag}:${tab.subKey}]]`;
        }

        if (tab.tag === "CHAT" && tab.subKey && !tab.subKey.includes(",")) {
            return `[[CHAT:${tab.subKey}]]`;
        }

        return null;
    }

    insertLinkToken(token) {

        const input = this.dom.input;
        const needsSpace = input.value.length > 0 && !input.value.endsWith(" ");

        input.value += (needsSpace ? " " : "") + token + " ";
        input.focus?.();
    }

    // Erkennt "[[TAG]]" bzw. "[[TAG:Wert]]"-Tokens im Nachrichten-
    // text und macht daraus einen klickbaren Link, der beim
    // Empfänger denselben Kanal aktiviert.
    linkifyMessageText(text) {

        return escapeHtml(text).replace(
            /\[\[([A-Z]+)(?::([^\]]+))?\]\]/g,
            (whole, tag, value) => {

                const label =
                    value ? `${tag}.${value}` : tag;

                return (
                    `<span class="chat-link" data-tag="${tag}" data-value="${value ?? ""}">` +
                    `🔗 ${escapeHtml(label)}</span>`
                );
            }
        );
    }


    // ------------------------------------------------
    // Senden / Kommandos
    // ------------------------------------------------

    findPlayerByName(name) {

        const needle =
            name.trim().toLowerCase();

        for (const [id, player] of players.entries()) {

            if (player.name.toLowerCase() === needle) {
                return { id, ...player };
            }
        }

        return null;
    }

    sendPayload(payload) {
        safeSend({ type: "chat", ...payload });
    }

    joinGroup(groupType, groupName) {

        safeSend({ type: "joinGroup", groupType, groupName });

        this.joinedGroups.add(groupName.toLowerCase());
        this.dismissedTags.delete("EVENT");
        this.dismissedTags.delete("PARTY");
        this.dismissedSubtabs.delete(`${groupType === "party" ? "PARTY" : "EVENT"}::${groupName}`);

        this.persist();
        logSystem(`Gruppe aktiviert: "${groupName}"`);

        this.renderTabs();
        this.renderHistory();
    }

    leaveGroup(groupType, groupName) {

        const key = groupName.toLowerCase();

        if (!this.joinedGroups.has(key)) {
            logSystem(`Du bist "${groupName}" nicht beigetreten`);
            return;
        }

        safeSend({ type: "leaveGroup", groupType, groupName });

        this.joinedGroups.delete(key);
        this.dismissedSubtabs.add(`EVENT::${groupName}`);
        this.dismissedSubtabs.add(`PARTY::${groupName}`);

        this.persist();
        logSystem(`Gruppe verlassen: "${groupName}"`);

        if (this.activeTabKey === `EVENT::${groupName}` || this.activeTabKey === `PARTY::${groupName}`) {
            this.activeTabKey = "ALL";
        }

        if (this.activeSendTarget.type === "group" && this.activeSendTarget.groupName === groupName) {
            this.setActiveTarget({ type: "world" });
        }

        this.renderTabs();
        this.renderHistory();
    }

    showHelpText() {

        logSystem(
            "Verfügbare Kommandos (\":\" oder \"/\" funktionieren beide, \",\" oder \":\" als Trenner):\n" +
            ":w Nachricht            - in die Welt (an alle) schreiben\n" +
            ":h / :t Nachricht       - in den Handel schreiben\n" +
            ":a Nachricht            - ins Gebiet schreiben\n" +
            ":c Name, Nachricht      - private Nachricht (Chat) an einen Spieler (Ziel wird beim Trennzeichen sofort aktiviert)\n" +
            "@Name, Nachricht        - Kurzform für ::Name (ebenfalls sofort aktiv)\n" +
            ":r Nachricht            - dem letzten privaten Absender antworten\n" +
            ":e Name, Nachricht      - Event aktivieren + senden\n" +
            ":e Nachricht            - an das zuletzt aktive Event\n" +
            ":p Name, Nachricht      - Party aktivieren + senden\n" +
            ":p Nachricht            - an die zuletzt aktive Party\n" +
            ":g Nachricht            - an die zuletzt aktive Gruppe (Event ODER Party, je nachdem was zuletzt aktiv war)\n" +
            "::Gruppenname           - Event aktivieren, danach normal weiterschreiben\n" +
            "::Gruppenname, Nachricht - Event aktivieren UND sofort eine Nachricht senden\n" +
            "::Name                  - funktioniert auch mit einem Spielernamen (privat aktivieren)\n" +
            ":exit Gruppenname       - Gruppe wieder verlassen\n" +
            ":whoami                 - eigene Spieler-Identität beim Server abfragen\n" +
            ":help oder help         - diese Hilfe anzeigen\n" +
            "Ohne Kommando: die Nachricht geht an das aktuell aktive Ziel (siehe Anzeige oben rechts in den Reitern)."
        );
    }

    // Findet den ersten "," ODER ":" als Trenner zwischen
    // Name/Gruppe und der eigentlichen Nachricht (beide Zeichen
    // sind gleichwertig erlaubt).
    #splitAtSeparator(text) {

        const index =
            text.search(/[,:]/);

        if (index === -1) {
            return null;
        }

        return {
            head: text.slice(0, index).trim(),
            tail: text.slice(index + 1).trim()
        };
    }

    // Gemeinsame Logik für ":e"/":p" (Event/Party):
    // - ":e Name, Nachricht" -> diese Gruppe aktivieren + senden
    // - ":e Nachricht" (kein Trenner gefunden) -> an die zuletzt
    //   für DIESEN Typ (Event bzw. Party) bekannte Gruppe senden
    #handleGroupLetterCommand(groupType, rest, lastForType) {

        const split =
            this.#splitAtSeparator(rest);

        const typeLabel =
            groupType === "party" ? "Party" : "Event";

        if (!split) {

            // Kein Trenner -> die ganze Eingabe ist die
            // Nachricht, gemeint ist die zuletzt bekannte Gruppe
            // dieses Typs.
            if (!lastForType) {
                logSystem(`Kein(e) letzte(s) ${typeLabel} bekannt - erst mit :${groupType === "party" ? "p" : "e"} Name, Nachricht aktivieren`);
                return;
            }

            if (rest.length === 0) {
                return;
            }

            this.setActiveTarget({ type: "group", groupType, groupName: lastForType.groupName });
            this.sendPayload({ scope: "group", groupType, groupName: lastForType.groupName, text: rest });
            return;
        }

        if (split.head.length === 0 || split.tail.length === 0) {
            logSystem(`Format: :${groupType === "party" ? "p" : "e"} Name, Nachricht`);
            return;
        }

        this.joinGroup(groupType, split.head);
        this.setActiveTarget({ type: "group", groupType, groupName: split.head });
        this.sendPayload({ scope: "group", groupType, groupName: split.head, text: split.tail });
    }

    handleCommand(command) {

        const spaceIndex = command.indexOf(" ");
        const cmdName = (spaceIndex === -1 ? command : command.slice(0, spaceIndex)).toLowerCase();
        const rest = spaceIndex === -1 ? "" : command.slice(spaceIndex + 1).trim();

        if (cmdName === "help") {
            this.showHelpText();
            return;
        }

        if (cmdName === "w") {

            if (rest.length === 0) return;
            this.setActiveTarget({ type: "world" });
            this.sendPayload({ scope: "world", text: rest });
            return;
        }

        if (cmdName === "h" || cmdName === "t") {

            if (rest.length === 0) return;
            this.setActiveTarget({ type: "trade" });
            this.sendPayload({ scope: "trade", text: rest });
            return;
        }

        if (cmdName === "a") {

            if (rest.length === 0) return;
            this.setActiveTarget({ type: "area" });
            this.sendPayload({ scope: "area", text: rest });
            return;
        }

        // "c" (Chat) - private Nachricht an einen Spieler,
        // vorher "p" - siehe Buchstaben-Neuzuteilung.
        if (cmdName === "c") {

            const split = this.#splitAtSeparator(rest);

            if (!split) {
                logSystem("Format: :c Name, Nachricht (oder :c Name: Nachricht)");
                return;
            }

            const target = this.findPlayerByName(split.head);

            if (!target) {
                logSystem(`Spieler "${split.head}" nicht gefunden`);
                return;
            }

            this.setActiveTarget({ type: "private", targetId: target.id, targetName: target.name });
            this.sendPayload({ scope: "selected", targets: [target.id], text: split.tail });
            return;
        }

        if (cmdName === "r") {

            if (!this.lastChatPartnerId) {
                logSystem("Kein letzter privater Gesprächspartner bekannt");
                return;
            }

            if (rest.length === 0) return;

            this.setActiveTarget({
                type: "private",
                targetId: this.lastChatPartnerId,
                targetName: players.get(this.lastChatPartnerId)?.name ?? `#${this.lastChatPartnerId}`
            });

            this.sendPayload({ scope: "selected", targets: [this.lastChatPartnerId], text: rest });
            return;
        }

        // "e" (Event) - entweder ":e Name, Nachricht" (neues/
        // anderes Event aktivieren + sofort senden) oder
        // ":e Nachricht" (ans zuletzt anvisierte Event).
        if (cmdName === "e") {
            this.#handleGroupLetterCommand("event", rest, this.lastEventTarget);
            return;
        }

        // "p" (Party) - genau wie "e", nur für Party-Gruppen.
        if (cmdName === "p") {
            this.#handleGroupLetterCommand("party", rest, this.lastPartyTarget);
            return;
        }

        // "g" (Gruppe, allgemein) - an die zuletzt anvisierte
        // Gruppe ODER Event, was auch immer zuletzt aktiv war.
        if (cmdName === "g") {

            if (!this.lastGroupTarget) {
                logSystem("Keine Gruppe/Event bekannt - erst mit ::Name, :e Name oder :p Name aktivieren");
                return;
            }

            if (rest.length === 0) return;

            this.setActiveTarget({
                type: "group",
                groupType: this.lastGroupTarget.groupType,
                groupName: this.lastGroupTarget.groupName
            });

            this.sendPayload({
                scope: "group",
                groupType: this.lastGroupTarget.groupType,
                groupName: this.lastGroupTarget.groupName,
                text: rest
            });

            return;
        }

        if (cmdName === "exit") {

            if (rest.length === 0) {
                logSystem("Format: :exit Gruppenname");
                return;
            }

            this.leaveGroup("event", rest);
            return;
        }

        if (cmdName === "whoami") {

            safeSend({ type: "whoami" });
            return;
        }

        logSystem(`Unbekanntes Kommando: :${cmdName} (:help für eine Übersicht)`);
    }

    // "::Gruppenname" oder "::Gruppenname, Nachricht" oder
    // "::Spielername" - aktiviert ein Ziel, optional direkt
    // mit einer Nachricht. "@Name" ruft dieselbe Logik auf.
    handleDoubleColon(rest) {

        const split =
            this.#splitAtSeparator(rest);

        const identifier =
            (split ? split.head : rest).trim();

        const messageText =
            split ? split.tail : "";

        if (identifier.length === 0) {
            logSystem("Format: ::Gruppenname oder ::Name (auch mit @Name möglich)");
            return;
        }

        const player = this.findPlayerByName(identifier);

        if (player) {

            this.setActiveTarget({ type: "private", targetId: player.id, targetName: player.name });
            logSystem(`Ziel aktiviert: ${player.name}`);

            if (messageText) {
                this.sendPayload({ scope: "selected", targets: [player.id], text: messageText });
            }

            return;
        }

        // Sonst: Gruppenname (Event).
        this.joinGroup("event", identifier);
        this.setActiveTarget({ type: "group", groupType: "event", groupName: identifier });

        if (messageText) {
            this.sendPayload({ scope: "group", groupType: "event", groupName: identifier, text: messageText });
        }
    }

    sendPlainText(text) {

        const t = this.activeSendTarget;

        if (t.type === "world") {
            this.sendPayload({ scope: "world", text });
        } else if (t.type === "trade") {
            this.sendPayload({ scope: "trade", text });
        } else if (t.type === "area") {
            this.sendPayload({ scope: "area", text });
        } else if (t.type === "admin") {
            this.sendPayload({ scope: "admin", text });
        } else if (t.type === "announcement") {

            if (!selfIsAdmin) {
                logSystem("Ankündigungen dürfen nur Admins schreiben");
                return;
            }

            this.sendPayload({ scope: "announcement", text });

        } else if (t.type === "group") {
            this.sendPayload({ scope: "group", groupType: t.groupType, groupName: t.groupName, text });
        } else if (t.type === "private") {
            this.sendPayload({ scope: "selected", targets: [t.targetId], text });
        } else if (t.type === "private-multi") {
            this.sendPayload({ scope: "selected", targets: t.targetIds, text });
        }
    }

    // --------------------------------------------------
    // Eingabe-Verlauf (Pfeiltasten hoch/runter, max. 20)
    // --------------------------------------------------

    pushInputHistory(text) {

        if (this.inputHistory[this.inputHistory.length - 1] === text) {
            // Direkte Wiederholung nicht doppelt merken.
            this.inputHistoryIndex = -1;
            return;
        }

        this.inputHistory.push(text);

        if (this.inputHistory.length > 20) {
            this.inputHistory.shift();
        }

        this.inputHistoryIndex = -1;
        this.inputDraft = "";
    }

    recallInputHistory(direction) {

        if (this.inputHistory.length === 0) {
            return;
        }

        if (this.inputHistoryIndex === -1) {

            // Gerade erst am Anfang des Durchblätterns - den
            // aktuell angefangenen (noch nicht gesendeten) Text
            // merken, damit man beim Runterblättern wieder
            // dorthin zurückkommt.
            this.inputDraft = this.dom.input.value;
            this.inputHistoryIndex = this.inputHistory.length;
        }

        this.inputHistoryIndex += direction;

        if (this.inputHistoryIndex < 0) {
            this.inputHistoryIndex = 0;
        }

        if (this.inputHistoryIndex >= this.inputHistory.length) {

            this.inputHistoryIndex = this.inputHistory.length;
            this.dom.input.value = this.inputDraft;
            return;
        }

        this.dom.input.value =
            this.inputHistory[this.inputHistoryIndex];
    }


    send() {

        const trimmed =
            this.dom.input.value.trim();

        if (trimmed.length === 0) {
            return;
        }

        this.pushInputHistory(trimmed);

        // "/" ist ein gleichwertiger Kommando-Präfix zu ":"
        // (beides wird angeboten) - hier einmal normalisieren,
        // danach läuft alles wie gehabt über ":"/"::"-Prüfungen.
        const raw =
            trimmed.startsWith("//")
                ? "::" + trimmed.slice(2)
                : trimmed.startsWith("/")
                    ? ":" + trimmed.slice(1)
                    : trimmed;

        if (raw.toLowerCase() === "help" || raw.toLowerCase() === ":help") {
            this.showHelpText();
            this.dom.input.value = "";
            return;
        }

        if (raw.startsWith("::")) {
            this.handleDoubleColon(raw.slice(2));
            this.dom.input.value = "";
            return;
        }

        // "@Name" ist eine Kurzform für "::Name" (Mention-Stil).
        if (raw.startsWith("@")) {
            this.handleDoubleColon(raw.slice(1));
            this.dom.input.value = "";
            return;
        }

        if (raw.startsWith(":")) {
            this.handleCommand(raw.slice(1));
            this.dom.input.value = "";
            return;
        }

        this.sendPlainText(raw);
        this.dom.input.value = "";
    }


    // ------------------------------------------------
    // Events
    // ------------------------------------------------

    // Mehrere Umwandlungen können sich aneinanderreihen (z.B.
    // "/r " -> ":p Name, " -> Ziel aktiviert + Präfix weg) -
    // deshalb nach jeder erfolgreichen Umwandlung erneut prüfen,
    // ob eine weitere zutrifft, statt nur einmal zu schauen
    // (sonst bleibt z.B. ":p Player 1, " sichtbar stehen, bis
    // der nächste Tastendruck kommt).
    processInputMacros() {

        for (let i = 0; i < 5; i++) {

            if (!this.applyOneInputMacro()) {
                break;
            }
        }
    }

    applyOneInputMacro() {

        const value =
            this.dom.input.value;

        const normalized =
            value.startsWith("//") ? "::" + value.slice(2) :
            value.startsWith("/") ? ":" + value.slice(1) :
            value;

        if (normalized === ":r ") {

            const partner =
                this.lastChatPartnerId ? players.get(this.lastChatPartnerId) : null;

            if (!partner) {
                return false;
            }

            this.dom.input.value = `:c ${partner.name}, `;
            return true;
        }

        // ":c Name," (privat, vorher ":p")
        const cMatch =
            normalized.match(/^:c ([^,:]+)[,:]\s?/);

        if (cMatch) {

            const target =
                this.findPlayerByName(cMatch[1]);

            if (!target) {
                return false;
            }

            this.setActiveTarget({ type: "private", targetId: target.id, targetName: target.name });
            this.dom.input.value = normalized.slice(cMatch[0].length);
            return true;
        }

        // ":e Name," (Event)
        const eMatch =
            normalized.match(/^:e ([^,:]+)[,:]\s?/);

        if (eMatch) {

            const groupName = eMatch[1].trim();

            this.joinGroup("event", groupName);
            this.setActiveTarget({ type: "group", groupType: "event", groupName });
            this.dom.input.value = normalized.slice(eMatch[0].length);
            return true;
        }

        // ":p Name," (Party)
        const partyMatch =
            normalized.match(/^:p ([^,:]+)[,:]\s?/);

        if (partyMatch) {

            const groupName = partyMatch[1].trim();

            this.joinGroup("party", groupName);
            this.setActiveTarget({ type: "group", groupType: "party", groupName });
            this.dom.input.value = normalized.slice(partyMatch[0].length);
            return true;
        }

        // "::Name,"/"::Gruppe:" ODER "@Name,"/"@Gruppe:" - beide
        // Präfixe führen zur selben Aktivierungslogik.
        const activationMatch =
            normalized.match(/^(::|@)([^,:]+)[,:]\s?/);

        if (activationMatch) {

            const identifier =
                activationMatch[2].trim();

            const player =
                this.findPlayerByName(identifier);

            if (player) {

                this.setActiveTarget({ type: "private", targetId: player.id, targetName: player.name });

            } else {

                this.joinGroup("event", identifier);
                this.setActiveTarget({ type: "group", groupType: "event", groupName: identifier });
            }

            this.dom.input.value = normalized.slice(activationMatch[0].length);
            return true;
        }

        return false;
    }


    populateTargetSelect() {

        this.dom.targetSelect.innerHTML = "";

        for (const [id, player] of players.entries()) {

            if (id === selfId) {
                continue;
            }

            const option = document.createElement("option");
            option.value = String(id);
            option.textContent = player.name;

            this.dom.targetSelect.appendChild(option);
        }
    }

    bindEvents() {

        this.dom.sendButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.send();
        });

        this.dom.input.addEventListener("keydown", (event) => {

            if (event.key === "Enter") {
                event.preventDefault();
                this.send();
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                this.recallInputHistory(-1);
                return;
            }

            if (event.key === "ArrowDown") {
                event.preventDefault();
                this.recallInputHistory(1);
            }
        });

        // Live-Umwandlungen im Eingabefeld - mehrere können sich
        // aneinanderreihen (z.B. "/r " -> ":p Name, " -> Ziel
        // aktiviert + Präfix verschwindet, alles in einem
        // Tastendruck, nicht erst beim nächsten):
        // - ":r "/"/r " -> ":p <letzter Partner>, "
        // - ":p Name," / ":p Name:" -> Ziel wird SOFORT aktiviert
        //   (Reiter + Eingabefeld-Farbe wechseln), Präfix weg.
        // - "::Name,"/"::Gruppenname," bzw. "@Name," ebenso.
        // "," und ":" sind als Trennzeichen gleichwertig erlaubt.
        this.dom.input.addEventListener("input", () => {
            this.processInputMacros();
        });

        this.dom.leaveAdminButton.addEventListener("click", () => {

            this.adminActive = false;
            this.unreadTabs.delete("ADMIN");

            this.renderLeaveAdminButton();
            this.renderTabs();
        });

        this.dom.scopeSelect.addEventListener("change", () => {

            const scope = this.dom.scopeSelect.value;

            this.dom.targetSelect.style.display = scope === "selected" ? "" : "none";
            this.dom.groupTypeSelect.style.display = scope === "group" ? "" : "none";
            this.dom.groupNameInput.style.display = scope === "group" ? "" : "none";

            if (scope === "world") {
                this.setActiveTarget({ type: "world" }, { switchView: this.beginnerMode });
            } else if (scope === "admin") {
                this.setActiveTarget({ type: "admin" }, { switchView: this.beginnerMode });
            } else if (scope === "selected") {
                this.populateTargetSelect();
            }
        });

        this.dom.targetSelect.addEventListener("change", () => {

            const ids =
                [...this.dom.targetSelect.selectedOptions].map((opt) => Number(opt.value));

            if (ids.length === 1) {

                this.setActiveTarget({
                    type: "private",
                    targetId: ids[0],
                    targetName: players.get(ids[0])?.name ?? `#${ids[0]}`
                }, { switchView: this.beginnerMode });

            } else if (ids.length > 1) {

                this.setActiveTarget({ type: "private-multi", targetIds: ids }, { switchView: this.beginnerMode });
            }
        });

        const updateFromGroupFields = () => {

            const groupName =
                this.dom.groupNameInput.value.trim();

            if (groupName) {

                this.setActiveTarget({
                    type: "group",
                    groupType: this.dom.groupTypeSelect.value,
                    groupName
                }, { switchView: this.beginnerMode });
            }
        };

        this.dom.groupNameInput.addEventListener("input", updateFromGroupFields);
        this.dom.groupTypeSelect.addEventListener("change", updateFromGroupFields);

        // Klick auf einen Spielernamen ODER auf den Tag einer
        // Nachricht im Verlauf bereitet ebenfalls ein Sende-Ziel
        // vor (delegiert, da die Zeilen dynamisch erzeugt werden).
        this.dom.history.addEventListener("click", (event) => {

            const linkEl = event.target.closest(".chat-link");

            if (linkEl) {

                this.activateFromLinkToken(
                    linkEl.dataset.tag,
                    linkEl.dataset.value || null
                );

                return;
            }

            const nameEl = event.target.closest(".msg-name");

            if (nameEl && nameEl.dataset.fromId) {

                const fromId = Number(nameEl.dataset.fromId);

                if (fromId !== selfId) {

                    this.setActiveTarget({
                        type: "private",
                        targetId: fromId,
                        targetName: players.get(fromId)?.name ?? nameEl.textContent
                    });
                }

                return;
            }

            const tagEl = event.target.closest(".tag");

            if (tagEl && tagEl.dataset.tag) {

                const tag = tagEl.dataset.tag;
                const groupName = tagEl.dataset.groupname || null;

                if (tag === "ADMIN") {
                    this.setActiveTarget({ type: "admin" });
                } else if ((tag === "EVENT" || tag === "PARTY") && groupName) {
                    this.setActiveTarget({ type: "group", groupType: tag === "PARTY" ? "party" : "event", groupName });
                } else if (tag === "WORLD") {
                    this.setActiveTarget({ type: "world" });
                } else if (tag === "TRADE") {
                    this.setActiveTarget({ type: "trade" });
                } else if (tag === "AREA") {
                    this.setActiveTarget({ type: "area" });
                }
            }
        });
    }

    // Reagiert auf einen Klick auf ein per Strg+Klick erzeugtes
    // Chat-Link-Token ("[[TAG]]"/"[[TAG:Wert]]") - aktiviert
    // beim Klickenden denselben Kanal.
    activateFromLinkToken(tag, value) {

        if (tag === "WORLD") {
            this.setActiveTarget({ type: "world" });
        } else if (tag === "TRADE") {
            this.setActiveTarget({ type: "trade" });
        } else if (tag === "AREA") {
            this.setActiveTarget({ type: "area" });
        } else if (tag === "ADMIN") {
            this.setActiveTarget({ type: "admin" });
        } else if (tag === "ANNOUNCEMENT") {
            this.setActiveTarget({ type: "announcement" });
        } else if ((tag === "EVENT" || tag === "PARTY") && value) {
            this.setActiveTarget({ type: "group", groupType: tag === "PARTY" ? "party" : "event", groupName: value });
        } else if (tag === "CHAT" && value) {

            const targetId = Number(value);

            this.setActiveTarget({
                type: "private",
                targetId,
                targetName: players.get(targetId)?.name ?? `#${targetId}`
            });
        }
    }
}


// --------------------------------------------------
// ChatUI instanziieren
// --------------------------------------------------

const chatUI =
    new ChatUI({
        panel: chatPanel,
        tabs: chatTabsElement,
        settingsPanel: chatSettingsPanel,
        leaveAdminButton: chatLeaveAdminButton,
        history: historyElement,
        input: chatInput,
        sendButton: chatSendButton,
        scopeSelect: chatScopeSelect,
        groupTypeSelect: chatGroupTypeSelect,
        groupNameInput: chatGroupNameInput,
        targetSelect: chatTargetSelect,
        scopeRow: document.getElementById("chatScopeRow"),
        hint: document.getElementById("chatHint")
    });
