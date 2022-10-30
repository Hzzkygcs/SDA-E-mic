const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
const senderAudioStreamWebsocket = new WebsocketCommunicationProtocol("/sender/audio-stream");


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
        const json = await blobToJsonString(blob);
        senderAudioStreamWebsocket.sendData(json);
        console.log("sending new blob");
    }

    recorderRtc = new RecordRTC(stream, options);
}


async function startStream() {
    await init();
    recorderRtc.startRecording();
}

let speakerElement = null;


async function stopStream(micStream, rtcConnection){
    onMuted();

    speakerElement = document.getElementById("speaker");

    recorderRtc.stopRecording(() => {});

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