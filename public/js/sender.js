const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
setTimeout(() => {
    console.assert(senderSdpWebsocket.websocket.readyState === 1);
    console.log("assert");
}, 1000);


async function getDevices(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices);
}

let dc;
async function createOffer(stream){
    const rtcConnection = new RTCPeerConnection(webRtcConfiguration);
    stream.getTracks().forEach((track) => {
        rtcConnection.addTrack(track, stream);
    });

    dc = rtcConnection.createDataChannel("mychannell");
    dc.onclose = onDisconnected;

    const iceCandidateGatheringComplete = new Deferred();

    let iceCandidateCounter = 0;
    rtcConnection.onicecandidate = async function (_ev){
        console.log("gotten an ice candidate");
        iceCandidateCounter += 1;

        if (iceCandidateCounter > 20){
            iceCandidateGatheringComplete.resolve(rtcConnection.localDescription);
        }
    }
    rtcConnection.onicegatheringstatechange = async function (event){
        if (rtcConnection.iceGatheringState !== 'complete') return;
        console.assert(event.candidate == null);
        console.log("ice gathering completed");

        iceCandidateGatheringComplete.resolve(rtcConnection.localDescription);


    }

    // const stopListeningToIceCandidate = listenToIceCandidateSignal(rtcConnection, senderIceCandidateWebsocket);
    // TODO: clearTimeout listening when connection is closed


    let offer = await rtcConnection.createOffer();
    await rtcConnection.setLocalDescription(offer);

    return {
        'offer': offer,
        'rtcConnection': rtcConnection,
        'iceGatheringCompletePromise': iceCandidateGatheringComplete.promise,
        'dc': dc
    };
}


async function onDisconnected(e){
    started = true;
    await toggleMicrophoneMute()
}



function onMuted() {
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
    document.getElementById("speaker-or-mic-btn").classList.add("muted");
}

function onConnecting() {
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
    document.getElementById("speaker-or-mic-btn").classList.add("connecting");
}


function onUnmuted() {
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
}



let started = false;
let rtcConnection;
let micStream;
async function toggleMicrophoneMute(){
    started = !started;
    if (started) {
        onConnecting();
        const temp = await startStream();
        rtcConnection = temp.rtcConnection;
        micStream = temp.stream;
    }else {
        document.getElementById("speaker-or-mic-btn").classList.toggle("muted");
        document.getElementById("speaker-or-mic-btn");
        await stopStream(micStream, rtcConnection);
    }
}


let senderRtcConnection = null;
async function startStream() {
    console.log("clicked");
    senderSdpWebsocket.clearPromiseQueue();
    senderSdpWebsocket.clearReceivedMessage();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true});
    console.log("gotten media");

    const {rtcConnection, iceGatheringCompletePromise, dc} = await createOffer(stream);
    dc.onopen = () => onUnmuted();
    senderRtcConnection = rtcConnection;

    console.log("ice gathering");
    const newestOffer = await iceGatheringCompletePromise;
    console.log("sending offer ");
    senderSdpWebsocket.sendData({
        offer: newestOffer
    });

    const answerFromRemoteWebRtc = await senderSdpWebsocket.getOrWaitForData();
    console.log("gotten answer: " + answerFromRemoteWebRtc);



    if (!rtcConnection.currentRemoteDescription) {
        await rtcConnection.setRemoteDescription(answerFromRemoteWebRtc.answer);
        console.log("received answer");
    }

    return {
        rtcConnection: rtcConnection,
        stream: stream
    };
}

async function stopStream(micStream, rtcConnection){
    onMuted();

    if (micStream != null)
        micStream.getTracks().forEach(function(track) {
            track.stop();
        });
    rtcConnection.close();
}