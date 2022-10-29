class CancelledPromiseQueueError extends Error{}

class WebsocketCommunicationProtocol{
    websocket = null;
    receivedMessagesQueue = [];
    /**
     * @type {Deferred[]}
     */
    deferredPromisesQueue = [];

    constructor(path) {
        this.websocket = new WebSocket(WEBSOCKET_SERVER_ADDR + path);
        this.websocket.onmessage = (message) => {this._onReceiveMessage(message)};

    }

    _onReceiveMessage(message){
        const data = JSON.parse(message.data);
        if (this.deferredPromisesQueue.length === 0) {
            this.receivedMessagesQueue.push(data);
            return;
        }

        const deferredPromises = this.deferredPromisesQueue.shift();
        deferredPromises.resolve(data);
    }

    sendData(data) {
        this.websocket.send(JSON.stringify(data));
    }

    getData(){
        if (this.receivedMessagesQueue.length === 0)
            return null;
        return this.receivedMessagesQueue.shift();  // pop left
    }

    clearReceivedMessage(){
        this.receivedMessagesQueue = [];
    }

    clearPromiseQueue(){
        for (const deferred of this.deferredPromisesQueue) {
            deferred.resolve(null);
        }
        this.deferredPromisesQueue = [];
    }

    async getOrWaitForData(){
        const data = this.getData();

        const promise = new Deferred();

        if (data == null){
            this.deferredPromisesQueue.push(promise);
        }else{
            promise.resolve(data);
        }

        return promise.promise;
    }
}
