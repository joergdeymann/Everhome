export class SystemMessageHandler {

    constructor(playerManager) {

        this.playerManager =
            playerManager;
    }


    handle(player, message) {

        if (message.type === "ping") {

            if (player && player.socket) {

                player.socket.send(
                    JSON.stringify({
                        type: "pong"
                    })
                );
            }

            return;
        }


        console.log(
            "UNBEKANNTE SYSTEMNACHRICHT:",
            message
        );
    }
}
