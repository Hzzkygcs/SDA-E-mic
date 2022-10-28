const express = require("express");
const path = require("path");
const {setupExpressWebsocket} = require("./setup/websocket");

const app = express();
app.set('view engine', 'ejs');
const expressWs = setupExpressWebsocket(app);

app.use('/static', express.static(path.join(__dirname, 'public')));

const {setupRoutes} = require("./setup/routes");
setupRoutes(app);


const PORT = 8080;
app.listen(PORT, () => console.log(`listening on port ${PORT}`));
