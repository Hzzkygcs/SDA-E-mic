const receiverSdpWebsocket = new WebsocketCommunicationProtocol("/receiver/sdp");
const receiverAudioStreamWebsocket = new WebsocketCommunicationProtocol("/receiver/audio-stream");

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
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
    document.getElementById("speaker-or-mic-btn").classList.add("muted");
}

function onConnecting() {
    document.getElementById("speaker-or-mic-btn").classList.add("connecting");
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
}

function onListeningStarted() {
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
}


/**
 * @type {Deferred | null}
 */
let listening = null;
let receiverRtcConnection = null;



// receiver should only receive one peer at a time
async function startListeningUsingWebsocket(){
    const audioElement = document.getElementById('speaker-for-websocket');
    loops = new WebsocketAudioStreamLoop(audioElement);
    loops.start(new Deferred());
    console.log("listening");
}

let BLOB;
let media1;
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
        media1 = new MediaSource();
        this.audioElement = new Audio(URL.createObjectURL(media1));
        this.audioElement.src = URL.createObjectURL(media1);

        const sourceOpenDeferred = new Deferred();
        media1.onsourceopen = () => sourceOpenDeferred.resolve();
        this.audioElement.play();
        await sourceOpenDeferred.promise;


        while (stoppingDeferred.state === Deferred.PENDING){
            console.log("RESET MEDIA");
            this.inactiveTimer = new Timer(5000);
            const stoppingPromise = Promise.any([this.inactiveTimer.promise, stoppingDeferred.promise]);

            this.blobHistory.forEach((i) => this.blobsArr.push(i));

            this.sourceBuffer = null;
            this.mediaSource = new MediaSource();
            this.audioElement = new Audio(URL.createObjectURL(this.mediaSource));
            this.audioElement.src = URL.createObjectURL(this.mediaSource);

            const sourceOpenDeferred = new Deferred();
            this.mediaSource.onsourceopen = () => sourceOpenDeferred.resolve();
            this.audioElement.play();
            await sourceOpenDeferred.promise;

            await this.receiveStreamLoop(stoppingDeferred);

            console.log('exit iter');
            console.log(this.sourceBuffer);

            if (this.sourceBuffer != null)
                this.mediaSource.removeSourceBuffer(this.sourceBuffer);
            this.sourceBuffer = null;
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
            const newBlobStrData = await receiverAudioStreamWebsocket.getOrWaitForDataWithStoppingPromise(stoppingDeferred);
            if (newBlobStrData == null)
                break

            const newBlob = await jsonStringToBlob(newBlobStrData);
            if (this.sourceBuffer == null) {
                console.log("RESET SOURCE BUFFER of mediasource " + id(this.mediaSource));
                BLOB = newBlob;
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





async function onClick(){
    if (listening == null)
        startListening();
    else{
        listening.resolve(null);
        listening = null;
    }
}


// receiver can only receive one peer at a time
async function startListening(){
    receiverSdpWebsocket.clearReceivedMessage();
    receiverSdpWebsocket.clearPromiseQueue();
    console.log("listening...");
    onConnecting();

    listening = new Deferred();
    let prevRtcConnection = null;
    let stopPrevIceCandidateListener = () => {};

    while (true){
        const data = await Promise.any([listening.promise, receiverSdpWebsocket.getOrWaitForData()]);
        if (data == null) break;
        const {offer} = data;
        stopPrevIceCandidateListener();
        if (prevRtcConnection != null)
            prevRtcConnection.close();

        open_cnt += 1;
        onListeningStarted();

        const {rtcConnection: localRtcConnection, iceGatheringCompletePromise} = createRtcConnection();
        const {stream} = await createAnswer(localRtcConnection, offer);

        console.log("setting srcObj to "+ stream);
        document.getElementById("speaker").srcObject = stream;
        document.getElementById("speaker").play();
        // stopPrevIceCandidateListener = listenToIceCandidateSignal(localRtcConnection, receiverIceCandidateWebsocket);

        console.log("sending answer");
        receiverSdpWebsocket.sendData({
            answer: await iceGatheringCompletePromise
        });


        prevRtcConnection = localRtcConnection;
        receiverRtcConnection = localRtcConnection;
        rtcConnection = localRtcConnection;
    }
    if (rtcConnection != null)
        rtcConnection.close();
    onListeningStopped();
    console.log("listening stopped");
}


let open_cnt = 0;

function connectionCheckViaDatachannel(rtcConnection){
    rtcConnection.ondatachannel = (datachannelEvent) => {
        rtcConnection.dc = datachannelEvent.channel;
        rtcConnection.dc.onmessage = (e) => console.log("msg: " + e.data);
        rtcConnection.dc.onopen = (e) => {
            console.log("Connection opened");
        };
        rtcConnection.dc.onclosing = () => {
            open_cnt -= 1;
            if (open_cnt == 0 && listening != null) {
                onConnecting();
            }
        };
    }
}
