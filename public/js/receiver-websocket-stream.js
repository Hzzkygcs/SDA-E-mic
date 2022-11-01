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
    loops = new WebsocketAudioStreamLoop(audioElement);
    startDeferred = new Deferred();
    loops.start(startDeferred);
    console.log("listening");
}

var errr;

/**
 * @param {Deferred} stoppingDeferredPromise
 * @return {Promise<void>}
 */
class WebsocketAudioStreamLoop{
    constructor(audioElement) {
        this.blobHistory = [];

        /**
         * @type {Blob[]}
         */
        this.blobsArr = [];
        this.audioElement = audioElement;

        /**
         * @type {null | MediaSource}
         */
        this.mediaSource = null;

        /**
         * @type {null | SourceBuffer}
         */
        this.sourceBuffer = null;
        this.inactiveTimer = null;
        this.currentSenderId = null;
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async start(stoppingDeferred){
        while (stoppingDeferred.state === Deferred.PENDING){
            console.log("RESET MEDIASOURCE");
            this.inactiveTimer = new Timer(800);

            onConnecting();
            this.currentSenderId = null;
            this.sourceBuffer = null;
            this.mediaSource = new MediaSource();
            this.audioElement = new Audio(URL.createObjectURL(this.mediaSource));
            this.audioElement.src = URL.createObjectURL(this.mediaSource);
            this.playAudioElement();
            const sourceOpenDeferred = new Deferred();
            this.mediaSource.onsourceopen = () => sourceOpenDeferred.resolve();

            await sourceOpenDeferred.promise;
            await this.receiveStreamLoopHandled(stoppingDeferred);

            if (this.mediaSource.readyState === "open"){
                this.mediaSource.endOfStream();
            }
        }
    }

    async playAudioElement(){
        try{
            await this.audioElement.play();
        }catch (e){
            errr = e
            // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
            if (e instanceof DOMException && e.message.includes('This SourceBuffer has been removed')){
                this.requestToRetry(e);
            }else throw e
        }
    }

    requestToRetry(err, client_id=null){
        console.log("Requested client to restart");

        const data = {command: 'START_FROM_BEGINNING'};
        if (client_id != null)
            data.id = client_id;
        receiverAudioStreamWebsocket.sendData(data)
        receiverAudioStreamWebsocket.clearPromiseQueue();
        receiverAudioStreamWebsocket.clearReceivedMessage();
    }


    async receiveStreamLoopHandled(stoppingDeferred){
        try{
            await this.receiveStreamLoop(stoppingDeferred);
        }catch (e) {
            // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
            if (e instanceof DOMException && e.message.includes('This SourceBuffer has been removed')){
                this.requestToRetry(e);
            }else throw e
        }
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async receiveStreamLoop(stoppingDeferred){
        stoppingDeferred = Deferred.any([this.inactiveTimer.promise, stoppingDeferred.promise]);

        while (this.inactiveTimer.resetTimer()){
            const newBlobStrDataDeferred = receiverAudioStreamWebsocket.getOrWaitForDataWithStoppingFlag(stoppingDeferred);
            const newBlobStrData = await newBlobStrDataDeferred.promise;
            if (newBlobStrData == null)
                break

            const parsed = JSON.parse(newBlobStrData);
            if (this.currentSenderId == null) {
                onListeningStarted()
                this.currentSenderId = parsed.id;
                // let it async
                receiverAudioStreamWebsocket.robustSendData({id: parsed.id,
                    command: WebsocketStreamConstants.CONNECTION_ACCEPTED});
            }
            if (this.currentSenderId !== parsed.id){
                // let it async
                receiverAudioStreamWebsocket.robustSendData({id: parsed.id,
                    command: WebsocketStreamConstants.CONNECTION_REJECTED});
                continue;
            }
            await this.handleNewBlob(newBlobStrData);
        }
    }

    async handleNewBlob(newBlobStrData){
        const newBlob = await jsonStringToBlob(newBlobStrData);
        if (this.sourceBuffer == null) {
            console.log("RESET SOURCE BUFFER of mediasource " + id(this.mediaSource));
            this.sourceBuffer = this.mediaSource.addSourceBuffer(newBlob.type);
            this.sourceBuffer.mode = 'sequence';
        }

        console.log("received new data ");
        this.blobHistory.push(newBlob);

        const arrayBuffer = await newBlob.arrayBuffer();
        const sourceBufferUpdateFinished = new Deferred();
        this.sourceBuffer.appendBuffer(arrayBuffer);

        this.sourceBuffer.onupdateend = () => sourceBufferUpdateFinished.resolve();
        await sourceBufferUpdateFinished.promise;
    }
}

