let receiverWebSocketConnection = null;


function setReceiverWebsocket(websocket){
    receiverWebSocketConnection = websocket;
}
module.exports.setReceiverWebsocket = setReceiverWebsocket;


function getReceiverWebsocket(){
     return receiverWebSocketConnection;
}
module.exports.getReceiverWebsocket = getReceiverWebsocket;





