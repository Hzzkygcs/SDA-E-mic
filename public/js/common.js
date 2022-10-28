// https://stackoverflow.com/a/34637436/7069108
class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject)=> {
            this.reject = reject
            this.resolve = resolve
        })
    }
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