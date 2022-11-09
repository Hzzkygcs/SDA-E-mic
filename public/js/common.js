// https://stackoverflow.com/a/34637436/7069108
class Deferred {
    static PENDING = 0;
    static RESOLVED = 1;
    static REJECTED = 2;

    constructor() {
        this.promise = new Promise((resolve, reject)=> {
            this.state = Deferred.PENDING;

            this.reject = (val) => {
                if (this.state === Deferred.PENDING) {
                    this.state = Deferred.REJECTED;
                    reject(val);
                }
            }

            this.resolve = (val) => {
                if (this.state === Deferred.PENDING){
                    this.state = Deferred.RESOLVED;
                    resolve(val);
                }
            }
        })
    }

    static any(arrOfPromise){
        const ret = new Deferred();

        (async () => {
            try{
                const res = await Promise.any(arrOfPromise);
                ret.resolve(res);
            }catch (e){
                ret.reject(e);
            }
        })();

        return ret;
    }

    static getResolvedDeferred(value){
        const ret = new Deferred();
        ret.resolve(value);
        return ret;
    }
}

function sleep(ms, returnValue=null) {
    return new Promise(resolve => setTimeout(() => {
        resolve(returnValue);
    }, ms));
}

class Timer extends Deferred{
    constructor(ms, returnValue=null, listener=null, startImmediately=true){
        super();

        this.ms = ms;
        this.returnValue = returnValue;
        this.timeout = null;
        this.listener = listener;
        if (startImmediately)
            this.resetTimer();
    }

    forceResetTimer(new_ms = null){
        this.state = Deferred.PENDING;
        this.resetTimer(new_ms);
    }

    clearTimeout(){
        if (this.timeout != null){
            clearTimeout(this.timeout);
        }
    }

    resetTimer(temporary_ms = null){
        if (this.state !== Deferred.PENDING)
            return false;

        this.clearTimeout();
        this.timeout = setTimeout(() => {
            this.onTimeout();
        }, (temporary_ms == null)? this.ms : temporary_ms);

        return true;
    }

    onTimeout(){
        this.resolve(this.returnValue);
        if (this.listener != null)
            this.listener(this.returnValue);
    }
}



async function blobToBase64(blob){
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function () {
            resolve(reader.result);
        };
    });
}

/**
 * @param {Blob} blob
 * @param {*} additionalObject
 * @return {Promise<string>}
 */
async function blobToJsonString(blob, additionalObject={}){
    const b64 = await blobToBase64(blob);
    const data = Object.assign({blob: b64, type: blob.type}, additionalObject);
    return JSON.stringify(data);
}

/**
 * @param {string} jsonString
 * @return {Promise<Blob>}
 */
async function jsonStringToBlob(jsonString){
    const parsed = JSON.parse(jsonString);
    const resultingBlob = await fetch(parsed.blob).then(res => res.blob());
    return new Blob([resultingBlob], {type: 'audio/webm;codecs=opus'});
}


/**
 * @param {any} jsonObject
 * @return {Promise<Blob>}
 */
async function jsonObjectToBlob(jsonObject){
    const resultingBlob = await fetch(jsonObject.blob).then(res => res.blob());
    return new Blob([resultingBlob], {type: jsonObject.type});
}

function playSingleBlob(audioElement, blob){
    audioElement.src = URL.createObjectURL(blob);
    audioElement.play();
}

/**
 * Get ID of an object https://stackoverflow.com/a/43963612/7069108
 * @type {function(*): any}
 */
const id = (() => {
    let currentId = 0;
    const map = new WeakMap();

    return (object) => {
        if (!map.has(object)) {
            map.set(object, ++currentId);
        }

        return map.get(object);
    };
})();





let debug;
$( document ).ready(function() {
    debug = console.log;
    if (DEBUG){
        debug = (...obj) => {
            console.log(...obj);
            const console_log_element = document.getElementById("console-log");
            let strBuild = "";
            for (const element of obj) {
                const temp = (
                    ((typeof element) == 'object') ? JSON.stringify(element) : element
                );
                strBuild += temp + " ";
            }
            console_log_element.innerHTML = console_log_element.innerHTML + "<br>" + strBuild;
        }
    }

    window.onunhandledrejection = event => {
        console.log(`${event.reason}`);
    };
});


/* =========================================================== */

function onWebsocketConnecting(){
    const button = document.getElementById("speaker-or-mic-btn");
    button.disabled = true;
    showStatus();
    setStatusLabel("Connecting...");
    setStatusValue("");
}
function onWebsocketConnected(){
    const button = document.getElementById("speaker-or-mic-btn");
    button.disabled = false;
    showStatus();
    setStatusLabel("Connected");
    setStatusValue("");

}

function setStatusLabel(newLabel){
    const label_element = document.getElementById("status-label");
    label_element.innerHTML = newLabel;
}
function setStatusValue(newValue){
    const value_element = document.getElementById("status-value");
    value_element.innerHTML = newValue;
}
function showStatus(){
    const container_element = document.getElementById("status-div");
    container_element.classList.remove("hidden-by-opacity");
}
function hideStatus(){
    const container_element = document.getElementById("status-div");
    container_element.classList.add("hidden-by-opacity");
}

/* =========================================================== */













/**
 * Return true if we slept peacefully, or any other value if we're woken up by a flag
 * @param {number} sleepTime
 * @param {Deferred} stoppingFlag
 * @return {Promise<Awaited<(*|Promise<unknown>)[][number]>>}
 */
async function sleepOrFlag(sleepTime, stoppingFlag){
    return Promise.any([
        stoppingFlag.promise,
        sleep(sleepTime, true)
    ])
}


/**
 * @param {RTCPeerConnection} rtcConnection
 * @param {WebsocketCommunicationProtocol} websocket
 * @return {Promise<void>}
 */
function listenToIceCandidateSignal(rtcConnection, websocket){
    let raiseFlag;
    let flagPromise = new Promise((res, _rej) => {
        raiseFlag = res;
    });

    async function runInParallel(){
        while (true){
            const remoteIceCandidate = await Promise.any([
                flagPromise,
                websocket.getOrWaitForData()
            ]);
            if (!remoteIceCandidate)  // if remoteIceCandidate comes from calling raiseFlag(false);
                break;
            console.log("received candidate");
            console.log(remoteIceCandidate.candidate);
            await rtcConnection.addIceCandidate(remoteIceCandidate.candidate);
        }
    }
    runInParallel();

    const stop = () => {
        raiseFlag(false);
    };
    return stop;
}


class WebsocketStreamConstants{
    static REQUEST_TO_CONNECT = 'REQUEST_TO_CONNECT';
    static UPDATE_QUEUE_STATUS = 'UPDATE_QUEUE_STATUS';

    static START_FROM_BEGINNING = 'START_FROM_BEGINNING';
    static CONNECTION_ACCEPTED = 'CONNECTION_ACCEPTED';
    static CONNECTION_REJECTED = 'CONNECTION_REJECTED';
    static CONNECTION_CLOSED = 'CONNECTION_CLOSED';
}