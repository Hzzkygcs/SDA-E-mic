const {WebSocket} = require('ws');

class WebsocketStorage{
    /**
     * @type {WebSocket[]}
     */
    senderWebsocketConnections = [];


    addSenderWebsocket(websocket){
        this.senderWebsocketConnections.push(websocket);
    }

    removeSenderWebsocket(index){
        const removed = this.senderWebsocketConnections[index];
        this.senderWebsocketConnections[index] = this.senderWebsocketConnections.at(-1);
        this.senderWebsocketConnections.pop();
        return removed;
    }

    /**
     * @return {WebSocket[]}
     */
    getWebsockets(){
        let i = 0;
        while (i < this.senderWebsocketConnections.length){
            const client = this.senderWebsocketConnections[i];

            if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING){
                const temp = this.removeSenderWebsocket(i);
                console.log("removed: " + temp);
                continue;
            }
            i++;
        }
        return this.senderWebsocketConnections;
    }
}


const websocketStorages = {
    senderIceCandidate: new WebsocketStorage(),
    senderSdp: new WebsocketStorage(),
    senderAudioStream: new WebsocketStorage(),

    receiverIceCandidate: new WebsocketStorage(),
    receiverSdp: new WebsocketStorage(),
    receiverAudioStream: new WebsocketStorage(),
}

module.exports.websocketStorages = websocketStorages;
