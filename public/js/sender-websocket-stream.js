const senderAudioStreamWebsocket = new WebsocketCommunicationProtocol(
    "/sender/audio-stream", false, (newState) => {
        if (newState === WebsocketCommunicationProtocol.OPENING){
            onWebsocketConnecting();
        }else onWebsocketConnected();
    }
);
$( document ).ready(function() {
    onWebsocketConnecting();
    senderAudioStreamWebsocket.reconnect();
});


let THIS_SENDER_ID = Math.floor(Math.random() * 10000);
const CMD_CONSTANTS = WebsocketStreamConstants;



async function getDevices(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    debug(devices);
}




function onMuted() {
    hideQueueStatus();
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
    document.getElementById("speaker-or-mic-btn").classList.add("muted");
}

function onConnecting() {
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
    document.getElementById("speaker-or-mic-btn").classList.add("connecting");
}

function onUnmuted() {
    hideQueueStatus();
    document.getElementById("speaker-or-mic-btn").classList.remove("muted");
    document.getElementById("speaker-or-mic-btn").classList.remove("connecting");
}



function setQueueNumber(newQueueNumber){
    setStatusLabel("Queue Number:");
    showStatus();
    setStatusValue(newQueueNumber);
    debug("My queue number: " + newQueueNumber);
}
function hideQueueStatus(){
    if (!listeningToNewMesages)
        return;
    hideStatus();
}




let started = false;
let rtcConnection;
let micStream;
let recorderRtc = [];
/**
 * @type {null | Timer}
 */
let closeConnectionTimer = null;
async function toggleMicrophoneMute(){
    started = !started;
    if (started) {
        hideStatus();
        await requestToStartSending();
    }else {
        document.getElementById("speaker-or-mic-btn").classList.toggle("muted");
        document.getElementById("speaker-or-mic-btn");
        await stopStream(micStream, rtcConnection);
    }
}

async function requestToStartSending(){
    THIS_SENDER_ID = Math.floor(Math.random() * 10000);
    onConnecting();
    senderAudioStreamWebsocket.clearReceivedMessage();
    senderAudioStreamWebsocket.clearPromiseQueue();

    if (closeConnectionTimer != null)
        closeConnectionTimer = new Timer(4000, null, () => {
            onMuted();
            closeConnectionTimer = null;
        })

    listeningToNewMesages = true;
    checkIfNewMessageReceived();
    await senderAudioStreamWebsocket.robustSendData({
        id: THIS_SENDER_ID,
        command: CMD_CONSTANTS.REQUEST_TO_CONNECT
    });
    debug("sending data");
}



async function init(){
    debug("clicked");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {echoCancellation: {
                echoCancellation: {exact: true}
            }}});

    debug("gotten media");

    const options = generateRecorderRtcOptions();
    options.ondataavailable = async (blob) => {
        const json = await blobToJsonString(blob, {id: THIS_SENDER_ID});
        await senderAudioStreamWebsocket.robustSendData(json, true);
        debug("sending new blob");
    }

    const ret = new RecordRTC(stream, options);
    recorderRtc.push(ret);
    return ret;
}




let listeningToNewMesages = false
async function checkIfNewMessageReceived(){
    while (listeningToNewMesages){
        const message = await senderAudioStreamWebsocket.getOrWaitForData();
        if (message == null)
            continue;

        debug(message);
        if ('id' in message && message.id !== THIS_SENDER_ID){
            // if this message was not for me
            continue;
        }

        const command = message.command;
        debug("Received command: " + command);

        if (command === CMD_CONSTANTS.UPDATE_QUEUE_STATUS) {
            setQueueNumber(message['queue_num']);

            if (closeConnectionTimer != null) {
                closeConnectionTimer.clearTimeout();
                closeConnectionTimer = null;
            }
        }else if (command === CMD_CONSTANTS.START_FROM_BEGINNING){
            debug("Receiver requested to start from beginning");
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


async function startStream() {
    started = true;
    const recRtc = await init();
    recRtc.startRecording();
}

let speakerElement = null;


async function stopStream(micStream, rtcConnection){

    started = false;
    onMuted();
    while (recorderRtc.length)
        recorderRtc.shift().stopRecording(() => {});

    listeningToNewMesages = false;
    speakerElement = document.getElementById("speaker");
}



function generateRecorderRtcOptions(){
    let options = {
        type: 'audio',
        numberOfAudioChannels: 1,  // isEdge ? 1 : 2,
        checkForInactiveTracks: true,
        bufferSize: 16384,

        timeSlice: 120,
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