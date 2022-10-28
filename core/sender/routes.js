const express = require("express");
const {addSenderWebsocket} = require("./model");
const {websocketStorages} = require("../common/client-websocket-storage");


const router = express.Router();


router.get("/", function (_req, res) {
    res.render("sender/sender");
});



router.ws('/ice-candidate',
    /**
     * @param {WebSocket} ws
     * @param req
     */
    function(ws, req) {
        websocketStorages.senderIceCandidate.addSenderWebsocket(ws);
        console.log("new sender connected (ice-candidate)");

        ws.on('message', function(msg) {
            websocketStorages.receiverIceCandidate.getWebsockets().forEach(client => {
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
        websocketStorages.senderSdp.addSenderWebsocket(ws);
        console.log("new sender connected (SDP)");

        ws.on('message', function(msg) {
            const websocketClients = websocketStorages.receiverSdp.getWebsockets();
            websocketClients.forEach(client => {
                client.send(msg)
            });
        });
    }
);


router.get("/test", function (_req, res) {
    // feel free to remove this
    res.render("sender/test");
});

module.exports.senderRouter = router;