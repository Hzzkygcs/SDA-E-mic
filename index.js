require('dotenv').config()
const express = require("express");
const path = require("path");
var https = require('https');
var http = require('http');
var fs = require('fs');
const {setupExpressWebsocket} = require("./setup/websocket");

const app = express();
app.set('view engine', 'ejs');
const expressWs = setupExpressWebsocket(app);


app.use('/static', express.static(path.join(__dirname, 'public')));


const CERT_PRIVATE_KEY = 'privatekey.key';
const CERTIFICATE = 'certificate.crt';

const {setupRoutes} = require("./setup/routes");
const {setupTurnServer} = require("./setup/turn-server");
setupRoutes(app);

const customHttpsAvailable = (
    fs.existsSync(CERT_PRIVATE_KEY)
    && fs.existsSync(CERTIFICATE)
    && process.env.ALLOW_LOCAL_HTTPS === '1'
);

let PORT = process.env.PORT || 8080;
setupTurnServer(PORT);
if (customHttpsAvailable){
    let options = {
        key: fs.readFileSync(CERT_PRIVATE_KEY),
        cert: fs.readFileSync(CERTIFICATE)
    };
    app.listen(PORT);
    PORT = 443;
    https.createServer(options, app).listen(PORT, () => console.log(`listening on port ${PORT} using https`));
}else{
    app.listen(PORT, () => console.log(`listening on port ${PORT} using default`));
}
