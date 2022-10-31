const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
const senderAudioStreamWebsocket = new WebsocketCommunicationProtocol("/sender/audio-stream");
const THIS_SENDER_ID = Math.floor(Math.random() * 1000);


setTimeout(() => {
    console.assert(senderSdpWebsocket.websocket.readyState === 1);
    console.log("assert");
}, 1000);


async function getDevices(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices);
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
let recorderRtc = null;
async function toggleMicrophoneMute(){
    started = !started;
    if (started) {
        onConnecting();
        await startStream();

    }else {
        document.getElementById("speaker-or-mic-btn").classList.toggle("muted");
        document.getElementById("speaker-or-mic-btn");
        await stopStream(micStream, rtcConnection);
    }
}




let audioChunks = [];
let senderRtcConnection = null;
async function init(){
    console.log("clicked");
    senderSdpWebsocket.clearReceivedMessage();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true});
    console.log("gotten media");

    const options = generateRecorderRtcOptions();
    options.ondataavailable = async (blob) => {
        const keepSendingNewBlob = await checkIfNewMessageReceived();
        if (!keepSendingNewBlob)
            return;

        const json = await blobToJsonString(blob, {id: THIS_SENDER_ID});
        senderAudioStreamWebsocket.sendData(json);
        console.log("sending new blob");
    }

    recorderRtc = new RecordRTC(stream, options);
}


async function checkIfNewMessageReceived(){
    while (senderAudioStreamWebsocket.hasQueuedMessage()){
        const message = await senderAudioStreamWebsocket.getOrWaitForData();

        if ('id' in message && message.id !== THIS_SENDER_ID){
            // if this message was not for me
            return;
        }

        const command = message.command;
        console.log("Received command: " + command);

        if (command === WebsocketStreamConstants.START_FROM_BEGINNING){
            console.log("Receiver requested to start from beginning");
            await stopStream(micStream, rtcConnection);
            // await startStream();
            return false;
        }else if (command === WebsocketStreamConstants.CONNECTION_ACCEPTED){
            onUnmuted();
        }else if (command === WebsocketStreamConstants.CONNECTION_REJECTED){
            await stopStream(micStream, rtcConnection);
        }
    }
    return true;
}


async function startStream() {
    await init();
    recorderRtc.startRecording();
}

let speakerElement = null;


async function stopStream(micStream, rtcConnection){
    onMuted();
    recorderRtc.stopRecording(() => {});
    speakerElement = document.getElementById("speaker");
}


function generateRecorderRtcOptions(){
    let options = {
        type: 'audio',
        numberOfAudioChannels: isEdge ? 1 : 2,
        checkForInactiveTracks: true,
        bufferSize: 16384,

        timeSlice: 200,
    };

    if(isSafari || isEdge) {
        options.recorderType = StereoAudioRecorder;
    }

    if(navigator.platform && navigator.platform.toString().toLowerCase().indexOf('win') === -1) {
        options.sampleRate = 48000; // or 44100 or remove this line for default
    }

    if(isSafari) {
        options.sampleRate = 44100;
        options.bufferSize = 4096;
        options.numberOfAudioChannels = 2;
    }
    return options;
}