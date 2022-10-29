const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
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
let mediaRecorder = null;
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
async function startStream() {
    console.log("clicked");
    senderSdpWebsocket.clearReceivedMessage();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true});
    console.log("gotten media");


    mediaRecorder = new RecordRTC(stream, generateRecorderRtcOptions());
    mediaRecorder.startRecording();
}

let speakerElement = null;


async function stopStream(micStream, rtcConnection){
    onMuted();

    speakerElement = document.getElementById("speaker");
    // mediaRecorder.stop();
    // const audioBlob = new Blob(audioChunks);
    // const audioUrl = URL.createObjectURL(audioBlob);
    // const audio = new Audio(audioUrl);
    // await audio.play();

    // let speakerElement = document.getElementById("speaker");
    // let audioData = new Blob(audioChunks, { 'type': 'audio/mp3;' });
    // speakerElement.src = window.URL.createObjectURL(audioData);

    mediaRecorder.stopRecording(() => {
        speakerElement.src = URL.createObjectURL(mediaRecorder.getBlob());
        speakerElement.play();
    });

}


function generateRecorderRtcOptions(){
    let options = {
        type: 'audio',
        numberOfAudioChannels: isEdge ? 1 : 2,
        checkForInactiveTracks: true,
        bufferSize: 16384
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