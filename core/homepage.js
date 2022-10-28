const express = require("express");


const router = express.Router();

router.get("/", async function (_req, res){
    res.render(`index`);
});

router.get("/temp-receiver", async function (_req, res){
    res.render(`temp-receiver`);
});

router.ws('/', function(ws, req) {
    ws.on('message', function(msg) {
        console.log(msg);
        ws.send("hi");
    });
    console.log('socket', req.testing);
});


module.exports.homepageRouter = router;