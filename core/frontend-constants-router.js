const express = require("express");


const router = express.Router();

router.get("/frontend-constants.js", async function (_req, res){
    res.render(`frontend-constants`);
});


module.exports.frontendConstantsRouter = router;