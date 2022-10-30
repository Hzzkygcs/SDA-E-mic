const receiverSdpWebsocket = new WebsocketCommunicationProtocol("/receiver/sdp");

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





async function toggleWebRtc(){
    if (listening == null)
        startListeningUsingWebRtc();
    else{
        listening.resolve(null);
        listening = null;
    }
}


// receiver can only receive one peer at a time
async function startListeningUsingWebRtc(){
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
