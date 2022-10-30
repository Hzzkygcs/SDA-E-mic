class WebsocketCommunicationProtocol{
    websocket = null;
    receivedMessagesQueue = [];
    promiseResolveFuncQueue = [];

    constructor(path) {
        this.websocket = new WebSocket(WEBSOCKET_SERVER_ADDR + path);
        this.websocket.onmessage = (message) => {this._onReceiveMessage(message)};

    }

    _onReceiveMessage(message){
        const data = JSON.parse(message.data);
        if (this.promiseResolveFuncQueue.length === 0) {
            this.receivedMessagesQueue.push(data);
            return;
        }

        const promiseResolveFunc = this.promiseResolveFuncQueue.shift();
        promiseResolveFunc(data);
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


    async deferredGetOrWaitForData(){
        const data = this.getData();

        const ret = new Deferred();

        if (data == null){
            // this.promiseResolveFuncQueue.push(ret);
        }else{
            // promiseResolveFunc(data);
        }

        return ret;
    }

    async getOrWaitForData(){
        const data = this.getData();

        let promiseResolveFunc = null;
        const promise = new Promise((resolve, _reject) => {
            promiseResolveFunc = resolve;
        });

        if (data == null){
            this.promiseResolveFuncQueue.push(promiseResolveFunc);
        }else{
            promiseResolveFunc(data);
        }

        return promise;
    }

    /**
     * @param {Deferred} timeoutDeferred
     * @return {Promise<void>}
     */
    async getOrWaitForDataWithStoppingPromise(timeoutDeferred){
        const res = await Deferred.any([timeoutDeferred.promise, this.getOrWaitForData()]);
        if (res !== await this.getOrWaitForData())
        return ;
    }
}
