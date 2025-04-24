"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.destroy = exports.setLogLevel = exports.tmqConnect = exports.sqlConnect = void 0;
const wsSql_1 = require("./sql/wsSql");
const wsTmq_1 = require("./tmq/wsTmq");
const log_1 = __importStar(require("./common/log"));
const wsConnectorPool_1 = require("./client/wsConnectorPool");
let sqlConnect = async (conf) => {
    try {
        return await wsSql_1.WsSql.open(conf);
    }
    catch (err) {
        log_1.default.error(err);
        throw err;
    }
};
exports.sqlConnect = sqlConnect;
let tmqConnect = async (configMap) => {
    try {
        return await wsTmq_1.WsConsumer.newConsumer(configMap);
    }
    catch (err) {
        log_1.default.error(err);
        throw err;
    }
};
exports.tmqConnect = tmqConnect;
let setLogLevel = (level) => {
    (0, log_1.setLevel)(level);
};
exports.setLogLevel = setLogLevel;
let destroy = () => {
    wsConnectorPool_1.WebSocketConnectionPool.instance().destroyed();
};
exports.destroy = destroy;
