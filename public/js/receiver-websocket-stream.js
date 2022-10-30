const receiverAudioStreamWebsocket = new WebsocketCommunicationProtocol("/receiver/audio-stream");

// receiver should only receive one peer at a time
async function startListeningUsingWebsocket(){
    const audioElement = document.getElementById('speaker-for-websocket');
    loops = new WebsocketAudioStreamLoop(audioElement);
    loops.start(new Deferred());
    console.log("listening");
}


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
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async start(stoppingDeferred){
        while (stoppingDeferred.state === Deferred.PENDING){
            console.log("RESET MEDIA");
            this.inactiveTimer = new Timer(1000);

            this.sourceBuffer = null;
            this.mediaSource = new MediaSource();
            this.audioElement = new Audio(URL.createObjectURL(this.mediaSource));
            this.audioElement.src = URL.createObjectURL(this.mediaSource);

            const sourceOpenDeferred = new Deferred();
            this.mediaSource.onsourceopen = () => sourceOpenDeferred.resolve();
            this.audioElement.play();
            await sourceOpenDeferred.promise;

            try{
                await this.receiveStreamLoop(stoppingDeferred);
            }catch (e){
                // Failed to execute 'appendBuffer' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.
                if (e instanceof DOMException){
                    receiverAudioStreamWebsocket.sendData({command: 'START_FROM_BEGINNING'})
                    receiverAudioStreamWebsocket.clearPromiseQueue();
                    receiverAudioStreamWebsocket.clearReceivedMessage();
                    continue;  // ignore
                }else throw e;
            }

            await sleep(150);
        }
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async receiveStreamLoop(stoppingDeferred){
        stoppingDeferred = Deferred.any([this.inactiveTimer.promise, stoppingDeferred.promise]);
        let counter = 0;

        while (this.inactiveTimer.resetTimer()){
            console.log(receiverAudioStreamWebsocket.deferredPromisesQueue);
            const newBlobStrDataDeferred = receiverAudioStreamWebsocket.getOrWaitForDataWithStoppingFlag(stoppingDeferred);
            const newBlobStrData = await newBlobStrDataDeferred.promise;
            if (newBlobStrData == null)
                break

            const newBlob = await jsonStringToBlob(newBlobStrData);
            if (this.sourceBuffer == null) {
                console.log("RESET SOURCE BUFFER of mediasource " + id(this.mediaSource));
                this.sourceBuffer = this.mediaSource.addSourceBuffer(newBlob.type);
                this.sourceBuffer.mode = 'sequence';
            }
            console.log(newBlob.type);

            counter += 1;
            console.log("received new data " + counter);
            this.blobHistory.push(newBlob);

            const arrayBuffer = await newBlob.arrayBuffer();
            const sourceBufferUpdateFinished = new Deferred();
            this.sourceBuffer.appendBuffer(arrayBuffer);

            this.sourceBuffer.onupdateend = () => sourceBufferUpdateFinished.resolve();
            await sourceBufferUpdateFinished.promise;
            console.log('iter');
            console.log(this.sourceBuffer);
        }
    }
}

