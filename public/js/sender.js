const senderIceCandidateWebsocket = new WebsocketCommunicationProtocol("/sender/ice-candidate");
const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
setTimeout(() => {
    console.assert(senderIceCandidateWebsocket.websocket.readyState === 1);
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

    const iceCandidateGatheringComplete = new Deferred();

    let iceCandidateCounter = 0;
    rtcConnection.onicecandidate = async function (ev){
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


        // senderIceCandidateWebsocket.sendData({
        //     candidate: event.candidate
        // });
    }

    // const stopListeningToIceCandidate = listenToIceCandidateSignal(rtcConnection, senderIceCandidateWebsocket);
    // TODO: stop listening when connection is closed


    let offer = await rtcConnection.createOffer();
    await rtcConnection.setLocalDescription(offer);

    return {
        'offer': offer,
        'rtcConnection': rtcConnection,
        'iceGatheringCompletePromise': iceCandidateGatheringComplete.promise,
    };
}


let senderRtcConnection = null;

async function startStream(listenToSelf=false) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true,
        video:
            {
                width: { max: 360 },
                height: { max: 280 },
                frameRate: { ideal: 3, max: 5 }
    }});

    const {offer, rtcConnection, iceGatheringCompletePromise} = await createOffer(stream);
    if (listenToSelf)
        $('#speaker')[0].srcObject = stream;



    senderRtcConnection = rtcConnection;

    console.log("ice gathering");
    const newestOffer = await iceGatheringCompletePromise;
    console.log("sending offer ");
    senderSdpWebsocket.sendData({
        offer: newestOffer
    });

    const answerFromRemoteWebRtc = await senderSdpWebsocket.getOrWaitForData();
    console.log(answerFromRemoteWebRtc);

    if (!rtcConnection.currentRemoteDescription) {
        await rtcConnection.setRemoteDescription(answerFromRemoteWebRtc.answer);
        console.log("received answer");
    }

    // const answerFromRemoteWebRtc = await senderSdpWebsocket.getOrWaitForData();
    // await rtcConnection.setRemoteDescription(answerFromRemoteWebRtc.answer);
    // console.log("received answer");

}

