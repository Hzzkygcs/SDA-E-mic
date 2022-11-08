const receiverAudioStreamWebsocket = new WebsocketCommunicationProtocol("/receiver/audio-stream");

async function toggleListeningUsingWebsocket(){
    if (startDeferred == null){
        await startListeningUsingWebsocket();
    }else {
        stopListeningUsingWebsocket();
        onListeningStopped();
        debug("listening stopped");
    }
}

function stopListeningUsingWebsocket(){
    startDeferred.resolve(null);
    startDeferred = null;
}


// receiver should only receive one peer at a time
let startDeferred;
let loops;
async function startListeningUsingWebsocket(){
    receiverAudioStreamWebsocket.clearReceivedMessage();
    receiverAudioStreamWebsocket.clearPromiseQueue();

    loops = new ConnectionListener();
    loops.stopAllClient();

    startDeferred = new Deferred();
    loops.start(startDeferred);
    debug("listening");
}

var errr;



class ConnectionListener{
    /**
     * @param {Deferred} stoppingDeferred
     */
    async start(stoppingDeferred){
        this.senderQueue = [];
        this.activeSender = {};
        this.maximumActiveSender = 2;
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
        if (parsedCommand.id == null){
            debug("ignoring a command without id: ", parsedCommand);
            return;
        }
        if (parsedCommand.command === WebsocketStreamConstants.REQUEST_TO_CONNECT){
            this.senderQueue.push(parsedCommand.id);
            if (!await this.processNextQueue())
                await receiverAudioStreamWebsocket.robustSendData({
                    id: parsedCommand.id,
                    command: WebsocketStreamConstants.UPDATE_QUEUE_STATUS,
                    queue_num: this.senderQueue.length,
                });
            debug(this.activeSender);
        }else if (parsedCommand.command === WebsocketStreamConstants.CONNECTION_CLOSED){
            if (parsedCommand.id in this.activeSender){
                await this.activeSender[parsedCommand.id].triggerConnectionClosed();
            }
        }
    }

    async handleBlobDataForwarding(parsedData){
        if (!(parsedData.id in this.activeSender)){
            debug(parsedData);
            debug(this.activeSender);
            debug("Rejected an inactive sender: " + parsedData["id"]);
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
        this.processNextQueue();
    }

    getActiveSenderLength(){
        return Object.keys(this.activeSender).length;
    }

    async processNextQueue() {
        if (this.getActiveSenderLength() >= this.maximumActiveSender)
            return false;
        if (this.senderQueue.length === 0)
            return false;
        const sender_id = this.senderQueue.shift();

        this.activeSender[sender_id] = new ConnectionToClient(sender_id,
            () => this.deactivateSender(sender_id));
        // let it async
        this.activeSender[sender_id].resetMediaSource();

        console.log("Sending connection accepted to " + sender_id);
        await receiverAudioStreamWebsocket.robustSendData({
            id: sender_id,
            command: WebsocketStreamConstants.CONNECTION_ACCEPTED
        });
        await this.notifyQueueUpdate();
        return true;
    }

    async notifyQueueUpdate(){
        for (let i = 0; i < this.senderQueue.length; i++) {
            const clientId = this.senderQueue[i];
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
        this.inactiveTimer = new Timer(1700, null, () => this.triggerConnectionClosed());
        this.onConnectionClosed = onConnectionClosed;

        /**
         * @type {null | SourceBuffer}
         */
        this.sourceBuffer = null;
        this.applyFilter = false;
        this.mediaSourceIsFresh = false;
        this.context = new AudioContext();
        this.mediaSourceOpenDeferred = new Deferred();
        this.temporaryBlobStorage = [];
    }


    async resetMediaSource() {
        debug("RESET MEDIASOURCE");
        console.assert(!this.mediaSourceIsFresh);

        this.sourceBuffer = null;
        this.mediaSourceIsFresh = true;
        this.mediaSource = new MediaSource();
        this.audioElement = new Audio(URL.createObjectURL(this.mediaSource));
        this.audioElement.src = URL.createObjectURL(this.mediaSource);
        if (this.applyFilter)
            applyFilter(this.context, this.audioElement);
        this.playAudioElement();
        this.mediaSourceOpenDeferred = new Deferred();
        this.mediaSource.onsourceopen = () => {
            this.mediaSourceOpenDeferred.resolve();
        }

        await this.mediaSourceOpenDeferred.promise;
        console.log("Mediasource opened");
    }

    async playAudioElement(){
        try{
            await this.audioElement.play();
        }catch (e){
            errr = e
            // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
            if (e instanceof DOMException && e.message.includes('This SourceBuffer has been removed')){
                await this.requestToRetry(e);
            }else debug(e.message);
        }
    }

    async triggerConnectionClosed(){
        debug("Conenction with " + this.senderId + " is closed");
        await receiverAudioStreamWebsocket.robustSendData({
            id: this.senderId,
            command: WebsocketStreamConstants.CONNECTION_CLOSED
        });
        this.onConnectionClosed(null);
    }

    async requestToRetry(){
        debug("Requested client to restart");

        const data = {command: 'START_FROM_BEGINNING', id: this.senderId};
        receiverAudioStreamWebsocket.sendData(data)
        await this.triggerConnectionClosed();
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

        if (this.sourceBuffer == null) {
            debug("RESET SOURCE BUFFER of mediasource " + id(this.mediaSource));
            this.sourceBuffer = this.mediaSource.addSourceBuffer(blobJsonObj.type);
            this.sourceBuffer.mode = 'sequence';
        }

        debug("received new data ");
        const blob = await jsonObjectToBlob(blobJsonObj);
        const arrayBuffer = await blob.arrayBuffer();
        const sourceBufferUpdateFinished = new Deferred();
        this.sourceBuffer.appendBuffer(arrayBuffer);

        this.sourceBuffer.onupdateend = () => sourceBufferUpdateFinished.resolve();
        await sourceBufferUpdateFinished.promise;
    }

    /**
     * @param {any} blobJsonObj
     * @return {Promise<void>}
     */
    async robustHandleNewBlob(blobJsonObj){
        try{
            this.inactiveTimer.resetTimer();
            this.temporaryBlobStorage.push(blobJsonObj);

            if (this.mediaSourceOpenDeferred.state === Deferred.RESOLVED){
                while (this.temporaryBlobStorage.length)
                    await this._handleNewBlob(this.temporaryBlobStorage.shift());
            }
        }catch (e) {
            let handled = false;


            if (e instanceof DOMException){
                if (
                    // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
                    e.message.includes('This SourceBuffer has been removed')
                    || e.message.includes('The MediaSource\'s readyState is not \'open\'.')
                ){
                    handled = true
                    await this.requestToRetry(e);
                }
            }
            if (!handled){
                // await this.requestToRetry();
                throw e;
            }
        }
    }
}


function applyFilter(context, element){
    debug("Applying filter");
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