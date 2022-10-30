// https://stackoverflow.com/a/34637436/7069108
class Deferred {
    static PENDING = 0;
    static RESOLVED = 1;
    static REJECTED = 2;

    constructor() {
        this.promise = new Promise((resolve, reject)=> {
            this.state = Deferred.PENDING;

            this.reject = (val) => {
                this.state = Deferred.REJECTED;
                reject(val);
            }

            this.resolve = (val) => {
                this.state = Deferred.RESOLVED;
                resolve(val);
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
    constructor(ms, returnValue=null){
        super();

        this.ms = ms;
        this.returnValue = returnValue;
        this.timeout = null;
    }

    resetTimer(new_ms = null){
        if (this.state !== Deferred.PENDING)
            return false;

        if (new_ms != null)
            this.ms = new_ms;

        if (this.timeout != null){
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {this.resolve(this.returnValue);}, this.ms);

        return true;
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


document.addEventListener("DOMContentLoaded", () => {
    let oldClog = console.log;
    console.log = (obj) => {
        oldClog(obj);
        const console_log_element = document.getElementById("console-log");
        console_log_element.innerHTML = console_log_element.innerHTML + "<br>" + obj;
    }

    window.onunhandledrejection = event => {
        console.log(`${event.reason}`);
    };
});


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
    static START_FROM_BEGINNING = 'START_FROM_BEGINNING';
    static CONNECTION_ACCEPTED = 'CONNECTION_ACCEPTED';
    static CONNECTION_REJECTED = 'CONNECTION_REJECTED';
}