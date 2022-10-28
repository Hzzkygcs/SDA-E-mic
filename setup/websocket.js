const express = require("express");

module.exports.expressWebsocket = null;

/**
 * @param {express.Express} app
 */
module.exports.setupExpressWebsocket = function (app){
    module.exports.expressWebsocket = require('express-ws')(app);
    return module.exports.expressWebsocket;
}