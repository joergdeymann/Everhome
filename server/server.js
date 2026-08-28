import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { PlayerManager } from "./PlayerManager.js";

import { EffectManager }
    from "./js/systems/effects/EffectManager.js";

import { EffectLoader }
    from "./js/systems/effects/EffectLoader.js";

import { SystemConnectionManager }
    from "./js/systems/network/SystemConnectionManager.js";

import { GameLoop }
    from "./js/gameloop/GameLoop.js";


const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


const PORT = 8080;


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
    "./data/effects/sample_effects.json",
    effectManager
);


// --------------------------------------------------
// HTTP Server
// --------------------------------------------------

const httpServer =
    http.createServer(
        (request, response) => {

            let filePath;


            if (request.url === "/") {

                filePath =
                    path.join(
                        __dirname,
                        "public",
                        "client.html"
                    );

            } else {

                filePath =
                    path.join(
                        __dirname,
                        "public",
                        request.url
                    );
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


                    if (
                        filePath.endsWith(".html")
                    ) {
                        contentType =
                            "text/html";
                    }


                    if (
                        filePath.endsWith(".js")
                    ) {
                        contentType =
                            "text/javascript";
                    }


                    response.writeHead(
                        200,
                        {
                            "Content-Type":
                                contentType
                        }
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


const systemConnectionManager =
    new SystemConnectionManager(
        webSocketServer,
        playerManager,
        effectManager
    );
    
systemConnectionManager.start();


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
            `Server läuft auf http://localhost:${PORT}`
        );

    }
);