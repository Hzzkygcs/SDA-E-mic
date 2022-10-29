let Turn = require('node-turn');


module.exports.setupTurnServer = async function (PORT){
    let server = new Turn({
        // set options
        listeningPort: PORT,
        authMech: 'long-term',
        credentials: {
            username: "pass-pass-word"
        }
    });
    server.addUser("client-123", "pass-pass-word")

    console.log("starting turn server");
    server.start();
    console.log("turn server started");
}