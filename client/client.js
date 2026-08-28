const playerIdElement =
    document.getElementById("playerId");

const logElement =
    document.getElementById("log");

const sendButton =
    document.getElementById("send");


if (!playerIdElement || !logElement || !sendButton) {
    throw new Error(
        "Game-UI konnte nicht gefunden werden."
    );
}

// const savedPlayerId =
//     localStorage.getItem("playerId");
const savedPlayerId =
    sessionStorage.getItem("playerId");

// --------------------------------------------------
// WebSocket
// --------------------------------------------------

const socket =
    new WebSocket("ws://localhost:8080");


socket.addEventListener("open", () => {

    console.log(
        "WEBSOCKET VERBUNDEN"
    );

 
    socket.send(
        JSON.stringify({
            type: "identify",
            playerId: savedPlayerId
                ? Number(savedPlayerId)
                : null
        })
    );
});


socket.addEventListener("message", (event) => {

    console.log(
        "MESSAGE VOM SERVER:",
        event.data
    );


    const message =
        JSON.parse(event.data);


    console.log(
        "MESSAGE OBJECT:",
        message
    );


    if (message.type === "identified") {

        console.log(
            "PLAYER ID ERHALTEN:",
            message.playerId
        );


        // localStorage.setItem(
        //     "playerId",
        //     String(message.playerId)
        // );
        sessionStorage.setItem(
            "playerId",
            String(message.playerId)
        );

        playerIdElement.textContent =
            String(message.playerId);


        return;
    }


    log(
        `Nachricht von Spieler ${message.from}: ` +
        JSON.stringify(message)
    );
});



socket.addEventListener("close", () => {

    console.log(
        "WEBSOCKET GETRENNT"
    );

    log(
        "Verbindung zum Server beendet"
    );
});


socket.addEventListener("error", (error) => {

    console.error(
        "WEBSOCKET FEHLER:",
        error
    );
});


// --------------------------------------------------
// Testnachricht
// --------------------------------------------------

sendButton.addEventListener("click", () => {

    socket.send(
        JSON.stringify({
            type: "effect",
            id: [5,5],
            target: 2
        })
    );

});


// --------------------------------------------------
// Log
// --------------------------------------------------

function log(message) {

    logElement.textContent +=
        message + "\n";
}