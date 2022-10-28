let receiverIceCandidateWebsocket = new WebsocketCommunicationProtocol("/receiver/ice-candidate");
const receiverSdpWebsocket = new WebsocketCommunicationProtocol("/receiver/sdp");
setTimeout(() => {
    console.assert(receiverIceCandidateWebsocket.websocket.readyState === 1);
    console.assert(receiverSdpWebsocket.websocket.readyState === 1);
    console.log("assert");
}, 1000);


/**
 *
 * @param offerObj
 * @return {Promise<{rtcConnection: RTCPeerConnection, answer: RTCSessionDescriptionInit, stream: MediaStream}>}
 */
async function createAnswer(offerObj){
    const rtcConnection = new RTCPeerConnection(webRtcConfiguration);
    connectionCheckViaDatachannel(rtcConnection);

    const stream = new MediaStream();
    rtcConnection.ontrack = function (event){
        event.streams[0].getTracks().forEach(track => {
            stream.addTrack(track);
        })
    }

    const iceCandidateGatheringComplete = new Deferred();
    rtcConnection.onicecandidate = async function (ev){
        console.log("gotten an ice candidate");
    }
    rtcConnection.onicegatheringstatechange = async function (event){
        if (rtcConnection.iceGatheringState !== 'complete') return;
        console.assert(event.candidate == null);
        console.log("ice gathering completed");

        iceCandidateGatheringComplete.resolve(rtcConnection.localDescription);

        // receiverIceCandidateWebsocket.sendData({
        //     candidate: event.candidate
        // });
    }

    console.log(offerObj);
    await rtcConnection.setRemoteDescription(offerObj);


    let answer = await rtcConnection.createAnswer();
    await rtcConnection.setLocalDescription(answer);
    return {
        'answer': rtcConnection.localDescription,
        'rtcConnection': rtcConnection,
        'stream': stream,
        'iceGatheringCompletePromise': iceCandidateGatheringComplete.promise,
    };
}




let listening = false;
let receiverRtcConnection = null;

// receiver can only receive one peer at a time
async function startListening(){
    console.log("listening...");
    listening = true;
    let prevRtcConnection = null;
    let stopPrevIceCandidateListener = () => {};

    while (listening){
        const {offer} = await receiverSdpWebsocket.getOrWaitForData();
        console.log("received new offer");
        console.log(stopPrevIceCandidateListener);
        stopPrevIceCandidateListener();
        if (prevRtcConnection != null)
            prevRtcConnection.close();

        const {answer, rtcConnection, stream, iceGatheringCompletePromise} = await createAnswer(offer);
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
    console.log("listening stopped");
}

function connectionCheckViaDatachannel(rtcConnection){
    rtcConnection.ondatachannel = (datachannelEvent) => {
        rtcConnection.dc = datachannelEvent.channel;
        rtcConnection.dc.onmessage = (e) => console.log("msg: " + e.data);
        rtcConnection.dc.onopen = (e) => console.log("Connection opened");
    }
}

startListening();