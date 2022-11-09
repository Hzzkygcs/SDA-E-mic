const consoleWebsocket = new WebsocketCommunicationProtocol("/console/websocket");
consoleWebsocket.onStateChanged = () => listener();

let userScrollIsAtBottom = true;
$(window).scroll(function() {
    if ($(window).scrollTop() + $(window).height() > $(document).height() - 100) {
        userScrollIsAtBottom = true;
    }else userScrollIsAtBottom = false;
});

function synchronizeUserScrollPos(){
    if (!userScrollIsAtBottom)
        return;
    let y = $(window).scrollTop();  //your current y position on the page
    $(window).scrollTop(y+50);
}


function escapeHtml(unsafe)
{
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function addTextToConsole(text){
    document.getElementById("console").innerHTML += `${escapeHtml(text)}<br>`;
    synchronizeUserScrollPos();
}

async function listener(){
    while (consoleWebsocket.isOpen()){
        const data = await consoleWebsocket.getOrWaitForData();
        addTextToConsole(data.data);
    }
    addTextToConsole("Console connection closed");
}
