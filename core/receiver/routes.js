const express = require("express");
const {websocketStorages} = require("../common/client-websocket-storage");


const router = express.Router();


router.get("/sda", function (req, res) {
    const debugMode = req.query.debug;
    res.render("receiver/receiver", { debugMode: debugMode != null, websocket: true });
});

router.ws('/ice-candidate',
    /**
     * @param {WebSocket} ws
     * @param req
     */
    function(ws, req) {
        websocketStorages.receiverIceCandidate.addSenderWebsocket(ws);
        console.log("new receiver connected (ice-candidate)");

        ws.on('message', function(msg) {
            websocketStorages.senderIceCandidate.getWebsockets().forEach(client => {
                client.send(msg)
            });
        });
    }
);




router.ws('/sdp',
    /**
     * @param {WebSocket} ws
     * @param req
     */
    function(ws, req) {
        websocketStorages.receiverSdp.addSenderWebsocket(ws);
        console.log("new receiver connected (SDP)");

        ws.on('message', function(msg) {
            websocketStorages.senderSdp.getWebsockets().forEach(client => {
                client.send(msg)
            });
        });
    }
);


router.ws('/audio-stream',
    /**
     * @param {WebSocket} ws
     * @param req
     */
    function(ws, req) {
        websocketStorages.receiverAudioStream.addSenderWebsocket(ws);
        console.log("new receiver connected (audio-stream)");

        ws.on('message', function(msg) {
            if (msg.length <= 70)
                console.log(`to sender (${websocketStorages.senderAudioStream.getLength()}): `, msg);

            websocketStorages.senderAudioStream.getWebsockets().forEach(client => {
                client.send(msg)
            });
        });
    }
);


module.exports.receiverRouter = router;