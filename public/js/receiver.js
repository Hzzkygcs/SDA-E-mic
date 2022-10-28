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

// receiver can only receive one peer at a time
async function startListening(){
    console.log("listening...");
    onTryingToListen();

    listening = true;
    let prevRtcConnection = null;
    let stopPrevIceCandidateListener = () => {};

    while (listening){
        onListeningStarted();

        const {offer} = await receiverSdpWebsocket.getOrWaitForData();
        stopPrevIceCandidateListener();
        if (prevRtcConnection != null)
            prevRtcConnection.close();

        const {rtcConnection, iceGatheringCompletePromise} = createRtcConnection();
        const {stream} = await createAnswer(rtcConnection, offer);
        console.log("setting srcObj to "+ stream);
        document.getElementById("speaker").srcObject = stream;
        document.getElementById("speaker").play();
        // stopPrevIceCandidateListener = listenToIceCandidateSignal(rtcConnection, receiverIceCandidateWebsocket);

        console.log("sending answer");
        receiverSdpWebsocket.sendData({
            answer: await iceGatheringCompletePromise
        });


        prevRtcConnection = rtcConnection;
        receiverRtcConnection = rtcConnection;
    }
    onListeningStopped();
    console.log("listening stopped");
}

function connectionCheckViaDatachannel(rtcConnection){
    rtcConnection.ondatachannel = (datachannelEvent) => {
        rtcConnection.dc = datachannelEvent.channel;
        rtcConnection.dc.onmessage = (e) => console.log("msg: " + e.data);
        rtcConnection.dc.onopen = (e) => console.log("Connection opened");
    }
}
