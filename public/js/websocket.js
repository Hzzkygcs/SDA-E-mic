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

        let deferredPromises = null;
        while (this.deferredPromisesQueue.length !== 0){
            deferredPromises = this.deferredPromisesQueue.shift();
            if (deferredPromises.state === Deferred.PENDING)
                break;
        }

        if (deferredPromises != null) {
            deferredPromises.resolve(data);
            return;
        }

        this.receivedMessagesQueue.push(data);
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

    /**
     * @return {Deferred}
     */
    deferredGetOrWaitForData(){
        const data = this.getData();
        const ret = new Deferred();

        if (data == null){
            this.deferredPromisesQueue.push(ret);
        }else{
            ret.resolve(data);
        }

        return ret;
    }

    async getOrWaitForData() {
        return this.deferredGetOrWaitForData().promise;
    }

    /**
     * @param {Deferred} timeoutDeferred
     * @return {Deferred}
     */
    getOrWaitForDataWithStoppingFlag(timeoutDeferred){
        const deferredGetData = this.deferredGetOrWaitForData();
        const ret = new Deferred();

        (async () => {
            try{
                const res = await Promise.any([timeoutDeferred.promise, deferredGetData.promise]);
                // cancel getData
                if (deferredGetData.state === Deferred.PENDING){
                    deferredGetData.reject();
                }

                ret.resolve(res);
            }catch (e){
                // cancel getData
                if (deferredGetData.state === Deferred.PENDING){
                    deferredGetData.reject();
                }
                ret.reject(e);
            }
        })();
        return ret;
    }
}
