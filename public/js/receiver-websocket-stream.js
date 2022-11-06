const receiverAudioStreamWebsocket = new WebsocketCommunicationProtocol("/receiver/audio-stream");

async function toggleListeningUsingWebsocket(){
    if (startDeferred == null){
        await startListeningUsingWebsocket();
    }else {
        stopListeningUsingWebsocket();
        onListeningStopped();
        console.log("listening stopped");
    }
}

function stopListeningUsingWebsocket(){
    startDeferred.resolve(null);
    startDeferred = null;
}


// receiver should only receive one peer at a time
let startDeferred;
async function startListeningUsingWebsocket(){
    const audioElement = document.getElementById('speaker-for-websocket');
    loops = new ConnectionListener(audioElement);
    startDeferred = new Deferred();
    loops.start(startDeferred);
    console.log("listening");
}

var errr;



class ConnectionListener{
    /**
     * @param {Deferred} stoppingDeferred
     */
    async start(stoppingDeferred){
        this.senderQueue = [];
        this.activeSender = {};
        this.maximumActiveSender = 1;
        await this.receiveStreamLoop(stoppingDeferred);
    }



    /**
     * @param {Deferred} stoppingDeferred
     */
    async receiveStreamLoop(stoppingDeferred){
        while (stoppingDeferred.state === Deferred.PENDING){
            const newDataDeferred = receiverAudioStreamWebsocket.getOrWaitForDataWithStoppingFlag(stoppingDeferred);
            const newData = await newDataDeferred.promise;
            if (newData == null)
                break

            if (newData.command != null){
                await this.handleCommand(newData);
            }else{
                await this.handleBlobDataForwarding(newData);
            }
        }
        await this.stopAllClient();
    }

    async handleCommand(parsedCommand){
        if (parsedCommand.command === WebsocketStreamConstants.REQUEST_TO_CONNECT){
            this.senderQueue.push(parsedCommand.id);
            await this.processNextQueue();
            console.log(this.activeSender);
        }
    }

    async handleBlobDataForwarding(parsedData){
        if (!(parsedData.id in this.activeSender)){
            console.log(parsedData);
            console.log(this.activeSender);
            console.log("Rejected an inactive sender: " + parsedData["id"]);
            await receiverAudioStreamWebsocket.robustSendData({
                id: parsedData.id,
                command: WebsocketStreamConstants.CONNECTION_REJECTED
            });
            return;
        }
        await this.activeSender[parsedData.id].robustHandleNewBlob(parsedData);
    }


    deactivateSender(senderId){
        if (!(senderId in this.activeSender))
            return;
        delete this.activeSender[senderId];
    }

    async processNextQueue() {
        if (this.activeSender.length >= this.maximumActiveSender)
            return;
        const sender_id = this.senderQueue.shift();

        this.activeSender[sender_id] = new ConnectionToClient(sender_id,
            () => this.deactivateSender(sender_id));
        await this.activeSender[sender_id].resetMediaSource();

        await receiverAudioStreamWebsocket.robustSendData({
            id: sender_id,
            command: WebsocketStreamConstants.CONNECTION_ACCEPTED
        });
        await this.notifyQueueUpdate();
    }

    async notifyQueueUpdate(){
        for (let i = 0; i < this.senderQueue.length; i++) {
            const clientId = this.senderQueue.shift();
            await receiverAudioStreamWebsocket.robustSendData({
                id: clientId,
                command: WebsocketStreamConstants.UPDATE_QUEUE_STATUS,
                queue_num: i+1,
            });
        }
    }


    async stopAllClient(){
        this.activeSender = {};
        const data = {command: WebsocketStreamConstants.CONNECTION_CLOSED};
        await receiverAudioStreamWebsocket.sendData(data)
    }
}



/**
 * @param {Deferred} stoppingDeferredPromise
 * @return {Promise<void>}
 */
class ConnectionToClient{
    constructor(senderId, onConnectionClosed) {
        this.audioElement = null;
        this.senderId = senderId;

        /**
         * @type {null | MediaSource}
         */
        this.mediaSource = null;
        this.inactiveTimer = new Timer(1500, null, () => this.triggerConnectionClosed());
        this.onConnectionClosed = onConnectionClosed;

        /**
         * @type {null | SourceBuffer}
         */
        this.sourceBuffer = null;
        this.applyFilter = false;
        this.mediaSourceIsFresh = false;
        this.context = new AudioContext();

    }


    async resetMediaSource() {
        console.log("RESET MEDIASOURCE");
        console.assert(!this.mediaSourceIsFresh);

        this.sourceBuffer = null;
        this.mediaSourceIsFresh = true;
        this.mediaSource = new MediaSource();
        this.audioElement = new Audio(URL.createObjectURL(this.mediaSource));
        this.audioElement.src = URL.createObjectURL(this.mediaSource);
        if (this.applyFilter)
            applyFilter(this.context, this.audioElement);
        this.playAudioElement();
        const sourceOpenDeferred = new Deferred();
        this.mediaSource.onsourceopen = () => sourceOpenDeferred.resolve();

        await sourceOpenDeferred.promise;
    }

    async playAudioElement(){
        try{
            await this.audioElement.play();
        }catch (e){
            errr = e
            // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
            if (e instanceof DOMException && e.message.includes('This SourceBuffer has been removed')){
                this.requestToRetry(e);
                await this.triggerConnectionClosed();
            }else console.log(e.message);
        }
    }

    async triggerConnectionClosed(){
        console.log("Conenction with " + this.senderId + " is closed");
        await receiverAudioStreamWebsocket.robustSendData({
            id: this.senderId,
            command: WebsocketStreamConstants.CONNECTION_CLOSED
        });
        this.onConnectionClosed(null);
    }

    requestToRetry(){
        console.log("Requested client to restart");

        const data = {command: 'START_FROM_BEGINNING', id: this.senderId};
        receiverAudioStreamWebsocket.sendData(data)
        receiverAudioStreamWebsocket.clearPromiseQueue();
        receiverAudioStreamWebsocket.clearReceivedMessage();
    }


    /**
     * blobJsonObj need to contain 2 key: blob and type.
     * Type is a string that represents the blob's encoding
     * blob is a string that represents the blob's data
     * @param blobJsonObj
     * @return {Promise<void>}
     * @private
     */
    async _handleNewBlob(blobJsonObj){
        this.inactiveTimer.resetTimer();

        const newBlob = await jsonObjectToBlob(blobJsonObj);
        if (this.sourceBuffer == null) {
            console.log("RESET SOURCE BUFFER of mediasource " + id(this.mediaSource));
            this.sourceBuffer = this.mediaSource.addSourceBuffer(newBlob.type);
            this.sourceBuffer.mode = 'sequence';
        }

        console.log("received new data ");

        const arrayBuffer = await newBlob.arrayBuffer();
        const sourceBufferUpdateFinished = new Deferred();
        this.sourceBuffer.appendBuffer(arrayBuffer);

        this.sourceBuffer.onupdateend = () => sourceBufferUpdateFinished.resolve();
        await sourceBufferUpdateFinished.promise;
    }

    /**
     * @param {string} blobJsonObj
     * @return {Promise<void>}
     */
    async robustHandleNewBlob(blobJsonObj){
        try{
            await this._handleNewBlob(blobJsonObj);
        }catch (e) {
            // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
            if (e instanceof DOMException && e.message.includes('This SourceBuffer has been removed')){
                this.requestToRetry(e);
            }else throw e
        }
    }
}


function applyFilter(context, element){
    console.log("Applying filter");
    let sourceNode = context.createMediaElementSource(element);
    let lowshelf = context.createBiquadFilter();
    let highfilter = context.createBiquadFilter();
    let bandpass = context.createBiquadFilter();

    // Low-pass filter. See BiquadFilterNode docs http://www.html5rocks.com/en/tutorials/webaudio/intro/
    lowshelf.type = 'lowshelf';  
    lowshelf.frequency.value = 3000; // Set cutoff to 440 HZ
    highfilter.gain.value = 0;

    highfilter.type = 'highshelf';  
    highfilter.frequency.value = 3200;
    highfilter.gain.value = -40;

    bandpass.type = 'bandpass';  
    bandpass.frequency.value = 2200;  
    bandpass.Q.value = 100;

    sourceNode.connect(lowshelf);
    sourceNode.connect(highfilter);
    sourceNode.connect(bandpass);
    lowshelf.connect(context.destination);
    highfilter.connect(context.destination);
    bandpass.connect(context.destination);
}