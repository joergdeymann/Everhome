import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { PlayerManager }
    from "./js/managers/PlayerManager.js";

import { EffectManager }
    from "./js/managers/EffectManager.js";

import { ConnectionManager }
    from "./js/managers/ConnectionManager.js";

import { EffectLoader }
    from "./js/systems/effects/EffectLoader.js";

import { GameLoop }
    from "./js/gameloop/GameLoop.js";


// --------------------------------------------------
// Pfade zur Laufzeit ermitteln - nichts hart codieren,
// damit das Projekt von jedem Arbeitsverzeichnis aus
// gestartet werden kann (z.B. "node server/app.js").
// --------------------------------------------------

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const publicDir =
    path.join(__dirname, "public");

const effectFile =
    path.join(
        __dirname,
        "data",
        "effects",
        "sample_effects.json"
    );

const PORT =
    process.env.PORT || 8080;


// --------------------------------------------------
// Manager
// --------------------------------------------------

const playerManager =
    new PlayerManager();

const effectManager =
    new EffectManager();


// --------------------------------------------------
// Effect-Daten laden
// --------------------------------------------------

EffectLoader.load(
    effectFile,
    effectManager
);


// --------------------------------------------------
// HTTP Server (liefert alles aus /public aus)
// --------------------------------------------------

const httpServer =
    http.createServer(
        (request, response) => {

            const relativePath =
                request.url === "/"
                    ? "client.html"
                    : request.url;

            // path.normalize gegen simple "../.."-Ausbruchsversuche
            // aus dem public-Ordner heraus.
            const filePath =
                path.join(
                    publicDir,
                    path.normalize(relativePath)
                );

            if (!filePath.startsWith(publicDir)) {

                response.writeHead(403);
                response.end("Forbidden");

                return;
            }

            fs.readFile(
                filePath,
                (error, data) => {

                    if (error) {

                        response.writeHead(404);
                        response.end("Not Found");

                        return;
                    }

                    let contentType =
                        "text/plain";

                    if (filePath.endsWith(".html")) {
                        contentType = "text/html";
                    }

                    if (filePath.endsWith(".js")) {
                        contentType = "text/javascript";
                    }

                    response.writeHead(
                        200,
                        { "Content-Type": contentType }
                    );

                    response.end(data);
                }
            );
        }
    );


// --------------------------------------------------
// WebSocket Server
// --------------------------------------------------

const webSocketServer =
    new WebSocketServer({
        server: httpServer
    });

const connectionManager =
    new ConnectionManager(
        webSocketServer,
        playerManager,
        effectManager,
        effectFile
    );

connectionManager.start();


// --------------------------------------------------
// GameLoop
// --------------------------------------------------

const gameLoop =
    new GameLoop(
        playerManager,
        effectManager,
        10 // Ticks pro Sekunde
    );

gameLoop.start();


// --------------------------------------------------
// Server starten
// --------------------------------------------------

httpServer.listen(
    PORT,
    () => {

        console.log(
            `Server läuft auf Port ${PORT}`
        );
    }
);
