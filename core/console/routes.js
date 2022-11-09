const express = require("express");
const {websocketStorages} = require("../common/client-websocket-storage");


const router = express.Router();
module.exports.consoleRouter = router;

router.get("", function (req, res) {
    const debugMode = req.query.debug;
    res.render("console/index", {
        debugMode: debugMode != null,
        websocket: true,
        history: history
    });
});


let history = [];
const consoleLog = console.log;
console.log = (...args) => {
    if (history.length >= 50)
        history.shift();

    consoleLog(...args);
    let print = "";
    for (const arg of args) {
        if (typeof arg === 'string')
            print += arg + " ";
        else
            print += JSON.stringify(arg) + " ";
    }

    history.push(print);
    websocketStorages.console.getWebsockets().forEach(client => {
        client.send(JSON.stringify({data: print}));
    });
}


router.ws('/websocket',
    /**
     * @param {WebSocket} ws
     * @param req
     */
    function(ws, req) {
        websocketStorages.console.addSenderWebsocket(ws);
        console.log("new console connected (audio-stream)");

        ws.on('message', function(msg) {
            console.log(`Do nothing after got a msg from console: ${msg}`);
        });
    }
);


module.exports.receiverRouter = router;