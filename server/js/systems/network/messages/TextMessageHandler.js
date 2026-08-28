export class TextMessageHandler {

    constructor(playerManager) {

        this.playerManager =
            playerManager;
    }


    handle(player, message) {

        if (!player) {

            console.log(
                "TEXT-NACHRICHT VOR IDENTIFIZIERUNG IGNORIERT"
            );

            return;
        }


        for (const otherPlayer of this.playerManager.players.values()) {

            if (
                otherPlayer.id === player.id ||
                !otherPlayer.connected ||
                !otherPlayer.socket
            ) {
                continue;
            }


            otherPlayer.socket.send(
                JSON.stringify({
                    ...message,
                    from: player.id
                })
            );
        }
    }
}
