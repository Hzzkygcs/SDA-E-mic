const senderSdpWebsocket = new WebsocketCommunicationProtocol("/sender/sdp");
const senderAudioStreamWebsocket = new WebsocketCommunicationProtocol("/sender/audio-stream");

const THIS_SENDER_ID = Math.floor(Math.random() * 10000);
const CMD_CONSTANTS = WebsocketStreamConstants;

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
        await senderAudioStreamWebsocket.robustSendData({
            id: THIS_SENDER_ID,
            command: CMD_CONSTANTS.REQUEST_TO_CONNECT
        });
        console.log("sending data");

        // await startStream();

    }else {
        document.getElementById("speaker-or-mic-btn").classList.toggle("muted");
        document.getElementById("speaker-or-mic-btn");
        await stopStream(micStream, rtcConnection);
    }
}



async function init(){
    console.log("clicked");
    senderSdpWebsocket.clearReceivedMessage();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {echoCancellation: {
                echoCancellation: {exact: true}
            }}});

    console.log("gotten media");

    const options = generateRecorderRtcOptions();
    options.ondataavailable = async (blob) => {
        const json = await blobToJsonString(blob, {id: THIS_SENDER_ID});
        await senderAudioStreamWebsocket.robustSendData(json, true);
        console.log("sending new blob");
    }

    recorderRtc = new RecordRTC(stream, options);
}


async function checkIfNewMessageReceived(){
    while (true){
        const message = await senderAudioStreamWebsocket.getOrWaitForData();

        if ('id' in message && message.id !== THIS_SENDER_ID){
            // if this message was not for me
            return;
        }

        const command = message.command;
        console.log("Received command: " + command);

        if (command === CMD_CONSTANTS.UPDATE_QUEUE_STATUS) {
            const queue_number = parseInt(message['queue_num']);
            console.log("My queue number: " + queue_number);
        }else if (command === CMD_CONSTANTS.START_FROM_BEGINNING){
            console.log("Receiver requested to start from beginning");
            await stopStream(micStream, rtcConnection);
            // await startStream();
            return false;
        }else if (command === CMD_CONSTANTS.CONNECTION_ACCEPTED && started){
            onUnmuted();
            startStream();
        }else if (command === CMD_CONSTANTS.CONNECTION_REJECTED || command === CMD_CONSTANTS.CONNECTION_CLOSED){
            await stopStream(micStream, rtcConnection);
        }
    }
    // return true;
}
checkIfNewMessageReceived();


async function startStream() {
    started = true;
    await init();
    recorderRtc.startRecording();
}

let speakerElement = null;


async function stopStream(micStream, rtcConnection){
    started = false;
    onMuted();
    recorderRtc.stopRecording(() => {});
    speakerElement = document.getElementById("speaker");
}



function generateRecorderRtcOptions(){
    let options = {
        type: 'audio',
        numberOfAudioChannels: isEdge ? 1 : 1,  // isEdge ? 1 : 2,
        checkForInactiveTracks: true,
        bufferSize: 16384,

        timeSlice: 150,
    };

    if(isSafari || isEdge) {
        options.recorderType = StereoAudioRecorder;
    }

    if(navigator.platform && navigator.platform.toString().toLowerCase().indexOf('win') === -1) {
        options.sampleRate = 12000; // 48000 or 44100 or remove this line for default
    }

    if(isSafari) {
        options.sampleRate = 12000;
        options.bufferSize = 4096;
        options.numberOfAudioChannels = 1;  // 2
    }
    return options;
}