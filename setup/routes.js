const express = require("express");
const {homepageRouter} = require("../core/homepage");
const {receiverRouter} = require("../core/receiver/routes");
const {senderRouter} = require("../core/sender/routes");
const {frontendConstantsRouter} = require("../core/frontend-constants-router");

/**
 *
 * @param {express.Express} app
 */
module.exports.setupRoutes = function (app){
    app.use("/", homepageRouter);
    app.use("/", frontendConstantsRouter);
    app.use("/receiver", receiverRouter);
    app.use("/sender", senderRouter);
}