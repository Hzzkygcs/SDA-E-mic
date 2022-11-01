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
        this.applyFilter = false;
        this.mediaSourceIsFresh = false;
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async start(stoppingDeferred){
        this.context = new AudioContext();

        while (stoppingDeferred.state === Deferred.PENDING){
            this.inactiveTimer = new Timer(800);

            onConnecting();
            if (!this.mediaSourceIsFresh)
                await this.resetMediaSource();
            await this.receiveStreamLoopHandled(stoppingDeferred);

            if (this.mediaSource.readyState === "open" && !this.mediaSourceIsFresh){
                this.mediaSource.endOfStream();
            }
        }
    }

    async resetMediaSource() {
        console.log("RESET MEDIASOURCE");
        console.assert(!this.mediaSourceIsFresh);

        this.currentSenderId = null;
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
                await sleep(150);
                receiverAudioStreamWebsocket.clearPromiseQueue();
                receiverAudioStreamWebsocket.clearReceivedMessage();
            }else console.log(e.message);
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
    async receiveStreamLoop(stoppingDeferred_){
        let stoppingDeferred;

        while (this.inactiveTimer.resetTimer()){
            stoppingDeferred = Deferred.any([this.inactiveTimer.promise, stoppingDeferred_.promise]);

            const newBlobStrDataDeferred = receiverAudioStreamWebsocket.getOrWaitForDataWithStoppingFlag(stoppingDeferred);
            const newBlobStrData = await newBlobStrDataDeferred.promise;
            if (newBlobStrData == null)
                break

            const parsed = JSON.parse(newBlobStrData);
            if (this.currentSenderId == null) {
                onListeningStarted()
                this.currentSenderId = parsed.id;
                this.mediaSourceIsFresh = false;
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