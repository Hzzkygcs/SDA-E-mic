const receiverSdpWebsocket = new WebsocketCommunicationProtocol("/receiver/sdp");
const senderAudioStreamWebsocket = new WebsocketCommunicationProtocol("/receiver/audio-stream");

setTimeout(() => {
    console.assert(receiverSdpWebsocket.websocket.readyState === 1);
    console.log("assert");
}, 3000);



function createRtcConnection(){
    const rtcConnection = new RTCPeerConnection(webRtcConfiguration);

    const iceCandidateGatheringComplete = new Deferred();
    rtcConnection.onicecandidate = async function (ev){
        console.log("gotten an ice candidate");
    }
    rtcConnection.onicegatheringstatechange = async function (event){
        if (rtcConnection.iceGatheringState !== 'complete') return;
        console.assert(event.candidate == null);
        console.log("ice gathering completed");

        iceCandidateGatheringComplete.resolve(rtcConnection.localDescription);
    }

    return {
        'rtcConnection': rtcConnection,
        'iceGatheringCompletePromise': iceCandidateGatheringComplete.promise,
    };
}



/**
 *
 * @param {RTCPeerConnection} rtcConnection
 * @param offerObj
 * @return {Promise<{rtcConnection: RTCPeerConnection, answer: RTCSessionDescriptionInit, stream: MediaStream}>}
 */
async function createAnswer(rtcConnection, offerObj){
    connectionCheckViaDatachannel(rtcConnection);

    const stream = new MediaStream();
    rtcConnection.ontrack = function (event){
        event.streams[0].getTracks().forEach(track => {
            stream.addTrack(track);
        })
    }

    console.log(offerObj);
    await rtcConnection.setRemoteDescription(offerObj);


    let answer = await rtcConnection.createAnswer();
    await rtcConnection.setLocalDescription(answer);
    return {
        'stream': stream,
    };
}


function onListeningStopped() {
    document.getElementById("listen-button").value = "Start";
}

function onTryingToListen() {
    document.getElementById("listen-button").value = "Starting";
}

function onListeningStarted() {
    document.getElementById("listen-button").value = "Listening";
}




let listening = false;
let receiverRtcConnection = null;




// receiver should only receive one peer at a time
async function startListeningUsingWebsocket(){
    const audioElement = document.getElementById('speaker-for-websocket');
    loops = new WebsocketAudioStreamLoop(audioElement);
    loops.start(new Deferred());
    console.log("listening");
}

let BLOB;

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
        console.log("STREAM LOOP RUN");

        while (stoppingDeferred.state === Deferred.PENDING){
            console.log("Reset media source");
            this.inactiveTimer = new Timer(5000);
            this.sourceBuffer = null;
            this.mediaSource = new MediaSource();

            this.audioElement.src = URL.createObjectURL(this.mediaSource);
            this.audioElement.play();

            // async
            await this.receiveStreamLoop(stoppingDeferred);
            await sleep(50);
            this.mediaSource.endOfStream();
        }
    }

    /**
     * @param {Deferred} stoppingDeferred
     */
    async receiveStreamLoop(stoppingDeferred){
        const stoppingPromise = Promise.any([this.inactiveTimer.promise, stoppingDeferred.promise]);
        let counter = 0;

        while (this.inactiveTimer.resetTimer()){
            const newBlobStrData = await senderAudioStreamWebsocket.getOrWaitForDataWithStoppingPromise(stoppingPromise);
            if (newBlobStrData == null)
                break

            const newBlob = await jsonStringToBlob(newBlobStrData);
            if (this.sourceBuffer == null) {
                BLOB = newBlob;
                console.log("CREATE NEW BUFFER");
                this.sourceBuffer = this.mediaSource.addSourceBuffer(newBlob.type);
                this.sourceBuffer.mode = 'sequence';
                await sleep(1000);
            }
            console.log(newBlob.type);

            counter += 1;
            console.log("received new data " + counter);
            this.blobsArr.push(newBlob);
            this.blobHistory.push(newBlob);

            const arrayBuffer = await newBlob.arrayBuffer();
            const sourceBufferUpdateFinished = new Deferred();
            this.sourceBuffer.appendBuffer(arrayBuffer);

            this.sourceBuffer.onupdateend = () => sourceBufferUpdateFinished.resolve();
            await sourceBufferUpdateFinished.promise;
        }
    }
}





function connectionCheckViaDatachannel(rtcConnection){
    rtcConnection.ondatachannel = (datachannelEvent) => {
        rtcConnection.dc = datachannelEvent.channel;
        rtcConnection.dc.onmessage = (e) => console.log("msg: " + e.data);
        rtcConnection.dc.onopen = (e) => console.log("Connection opened");
    }
}
