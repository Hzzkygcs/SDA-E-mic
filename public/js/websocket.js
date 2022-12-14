class CancelledPromiseQueueError extends Error{}

class WebsocketCommunicationProtocol{
    static OPENED = 'open';
    static OPENING = 'opening';
    static STATES = [WebsocketCommunicationProtocol.OPENED, WebsocketCommunicationProtocol.OPENING];

    websocket = null;
    receivedMessagesQueue = [];
    /**
     * @type {Deferred[]}
     */
    deferredPromisesQueue = [];

    /**
     * @type {CallableFunction<any, boolean>[]}
     */
    listeners = [];

    constructor(path, connectImmediately=true, stateChangedListener=null) {
        this.path = path;
        /**
         * @type {WebSocket | null}
         */
        this.websocket = null;
        this._state = WebsocketCommunicationProtocol.OPENING;
        if (connectImmediately)
            this.reconnect();
        /**
         * @type {Deferred[]}
         */
        this.awaitToOpen = [];
        this.onStateChanged = stateChangedListener;
    }

    _setState(newState){
        console.assert(WebsocketCommunicationProtocol.STATES.includes(newState));
        const oldState = this._state;
        this._state = newState;
        if (this.onStateChanged != null && this._state !== oldState)
            this.onStateChanged(newState);
    }

    addListener(func){
        this.listeners.push(func);
    }

    reconnect(){
        console.log("Connecting websocket");
        this._setState(WebsocketCommunicationProtocol.OPENING);
        this.websocket = new WebSocket(WEBSOCKET_SERVER_ADDR + this.path);
        this.websocket.onmessage = (message) => {this._onReceiveMessage(message)};
        this.websocket.onopen = (e) => {
            this._setState(WebsocketCommunicationProtocol.OPENED);
            console.log("Conencted");

            for (const deferred of this.awaitToOpen) {
                if (deferred.state === Deferred.PENDING)
                    deferred.resolve(true);
            }
        };
        this.websocket.onclose = (e) => {
            this._setState(WebsocketCommunicationProtocol.OPENING);
            this.reconnect();
        }
    }
    isOpen() { return this.websocket.readyState === WebSocket.OPEN }
    isClosed() { return this.websocket.readyState === WebSocket.CLOSED }

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

    hasQueuedMessage(){
        return this.receivedMessagesQueue.length > 0;
    }

    sendData(data) {
        this.websocket.send(JSON.stringify(data));
    }

    async ensureWebsocketIsOpen(){
        if (this.isOpen())
            return;
        if (this.isClosed())
            this.reconnect();
        const deferred = new Deferred();
        this.awaitToOpen.push(deferred);
        await deferred.promise;
    }

    async robustSendData(data, asJsonStr=false) {
        await this.ensureWebsocketIsOpen();
        if (!asJsonStr)
            data = JSON.stringify(data);
        this.websocket.send(data);
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
    deferredGetOrWaitForData(robustMode=true){
        const data = this.getData();
        const ret = new Deferred();

        if (data == null){
            if (robustMode)
                // let it async
                this.ensureWebsocketIsOpen();
            this.deferredPromisesQueue.push(ret);
        }else{
            ret.resolve(data);
        }

        return ret;
    }

    async getOrWaitForData(robustMode=true) {
        return this.deferredGetOrWaitForData(robustMode).promise;
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
